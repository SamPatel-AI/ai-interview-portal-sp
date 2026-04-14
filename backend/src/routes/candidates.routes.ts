import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { supabaseAdmin } from '../config/database';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import '../types';
import { logger } from '../utils/logger';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate);

// ─── Validation ────────────────────────────────────────────

const createCandidateSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  location: z.string().optional(),
  work_authorization: z.string().optional(),
  source: z.string().optional(),
});

const updateCandidateSchema = createCandidateSchema.partial();

// ─── GET /api/candidates ───────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const { search, source, sort_by, sort_order } = req.query;

    let query = supabaseAdmin
      .from('candidates')
      .select('*, applications (id)', { count: 'exact' })
      .eq('org_id', req.user!.org_id);

    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
      );
    }

    if (source) {
      query = query.eq('source', source);
    }

    const sortField = (sort_by as string) || 'created_at';
    const ascending = sort_order === 'asc';
    query = query.order(sortField, { ascending }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw new AppError(500, 'Failed to fetch candidates');

    // Add applications_count for the frontend
    const enriched = (data ?? []).map(({ applications, ...candidate }) => ({
      ...candidate,
      applications_count: Array.isArray(applications) ? applications.length : 0,
    }));

    res.json({
      success: true,
      data: enriched,
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/candidates/:id ───────────────────────────────

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('candidates')
      .select(`
        *,
        applications (
          id, job_id, status, ai_screening_score, created_at,
          jobs (id, title, client_company_id, status)
        )
      `)
      .eq('id', req.params.id)
      .eq('org_id', req.user!.org_id)
      .single();

    if (error || !data) throw new AppError(404, 'Candidate not found');

    // Also fetch call history
    const { data: calls } = await supabaseAdmin
      .from('calls')
      .select('id, direction, status, duration_seconds, started_at, recording_url')
      .eq('candidate_id', req.params.id)
      .eq('org_id', req.user!.org_id)
      .order('created_at', { ascending: false })
      .limit(20);

    res.json({ success: true, data: { ...data, calls: calls ?? [] } });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/candidates ──────────────────────────────────

router.post(
  '/',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createCandidateSchema.parse(req.body);

      const { data, error } = await supabaseAdmin
        .from('candidates')
        .insert({
          ...body,
          org_id: req.user!.org_id,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new AppError(409, 'Candidate with this email already exists');
        }
        throw new AppError(500, 'Failed to create candidate');
      }

      await supabaseAdmin.from('activity_log').insert({
        org_id: req.user!.org_id,
        user_id: req.user!.id,
        entity_type: 'candidate',
        entity_id: data.id,
        action: 'created',
        details: { email: body.email },
      });

      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/candidates/:id ─────────────────────────────

router.patch(
  '/:id',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = updateCandidateSchema.parse(req.body);

      const { data, error } = await supabaseAdmin
        .from('candidates')
        .update(body)
        .eq('id', req.params.id)
        .eq('org_id', req.user!.org_id)
        .select()
        .single();

      if (error || !data) throw new AppError(404, 'Candidate not found');

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/candidates/:id/resume ───────────────────────
// Upload resume file to Supabase Storage

router.post(
  '/:id/resume',
  requireRole('admin', 'recruiter'),
  upload.single('resume'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) throw new AppError(400, 'No file uploaded');

      const candidateId = req.params.id;

      // Verify candidate belongs to org
      const { data: candidate, error: candErr } = await supabaseAdmin
        .from('candidates')
        .select('id')
        .eq('id', candidateId)
        .eq('org_id', req.user!.org_id)
        .single();

      if (candErr || !candidate) throw new AppError(404, 'Candidate not found');

      // Upload to Supabase Storage
      const filePath = `${req.user!.org_id}/${candidateId}/${req.file.originalname}`;
      const { error: uploadErr } = await supabaseAdmin.storage
        .from('resumes')
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true,
        });

      if (uploadErr) {
        logger.error('Resume upload failed:', uploadErr);
        throw new AppError(500, 'Failed to upload resume');
      }

      // Update candidate record
      const { data: publicUrl } = supabaseAdmin.storage
        .from('resumes')
        .getPublicUrl(filePath);

      await supabaseAdmin
        .from('candidates')
        .update({ resume_url: filePath })
        .eq('id', candidateId);

      res.json({
        success: true,
        data: { resume_url: filePath, public_url: publicUrl.publicUrl },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/candidates/check-duplicates ─────────────────
// Check for potential duplicate candidates by name, email, or phone

router.post(
  '/check-duplicates',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, first_name, last_name, phone } = req.body;
      const orgId = req.user!.org_id;

      if (!email && !first_name && !phone) {
        throw new AppError(400, 'Provide at least one of: email, first_name, phone');
      }

      const matches: Array<{
        candidate: Record<string, unknown>;
        match_type: string;
        confidence: 'exact' | 'high' | 'medium';
      }> = [];

      // Exact email match
      if (email) {
        const { data } = await supabaseAdmin
          .from('candidates')
          .select('id, first_name, last_name, email, phone, created_at')
          .eq('org_id', orgId)
          .ilike('email', email);

        for (const c of data || []) {
          matches.push({ candidate: c, match_type: 'email', confidence: 'exact' });
        }
      }

      // Exact phone match
      if (phone) {
        const cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.length >= 7) {
          const { data } = await supabaseAdmin
            .from('candidates')
            .select('id, first_name, last_name, email, phone, created_at')
            .eq('org_id', orgId)
            .ilike('phone', `%${cleanPhone.slice(-10)}%`);

          for (const c of data || []) {
            if (!matches.find(m => (m.candidate as any).id === c.id)) {
              matches.push({ candidate: c, match_type: 'phone', confidence: 'high' });
            }
          }
        }
      }

      // Name similarity match
      if (first_name && last_name) {
        const { data } = await supabaseAdmin
          .from('candidates')
          .select('id, first_name, last_name, email, phone, created_at')
          .eq('org_id', orgId)
          .ilike('first_name', `%${first_name}%`)
          .ilike('last_name', `%${last_name}%`);

        for (const c of data || []) {
          if (!matches.find(m => (m.candidate as any).id === c.id)) {
            matches.push({ candidate: c, match_type: 'name', confidence: 'medium' });
          }
        }
      }

      res.json({
        success: true,
        data: {
          duplicates_found: matches.length,
          matches,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
