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

export default router;
