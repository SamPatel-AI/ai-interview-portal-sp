import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { supabaseAdmin } from '../config/database';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import '../types';
import { logger } from '../utils/logger';
import { resumeStoragePath } from '../utils/resumePath';

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

const updateCandidateSchema = createCandidateSchema.partial().extend({
  // Manual opt-out toggle for recruiters (the email unsubscribe link is the
  // candidate-facing path; this covers phone/email requests).
  reengagement_opted_out: z.boolean().optional(),
});

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

      await supabaseAdmin
        .from('candidates')
        .update({ resume_url: filePath })
        .eq('id', candidateId);

      res.json({
        success: true,
        data: { resume_url: filePath },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/candidates/:id/resume ────────────────────────
// The resumes bucket is private (service-role only, migration 017), so the
// frontend can't link to files directly. This mints a short-lived signed URL.
// Returned as JSON rather than a redirect: the JWT rides in fetch headers, so
// a browser-followed <a href> to this endpoint could never authenticate.

router.get('/:id/resume', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data: candidate, error } = await supabaseAdmin
      .from('candidates')
      .select('id, resume_url')
      .eq('id', req.params.id)
      .eq('org_id', req.user!.org_id)
      .single();

    if (error || !candidate) throw new AppError(404, 'Candidate not found');

    const path = resumeStoragePath(candidate.resume_url);
    if (!path) throw new AppError(404, 'Candidate has no stored resume');

    const EXPIRES_IN = 300; // seconds
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from('resumes')
      .createSignedUrl(path, EXPIRES_IN);

    if (signErr || !signed?.signedUrl) {
      logger.error(`Failed to sign resume URL for candidate ${candidate.id}:`, signErr);
      throw new AppError(500, 'Failed to generate resume link');
    }

    res.json({ success: true, data: { url: signed.signedUrl, expires_in: EXPIRES_IN } });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/candidates/:id ─────────────────────────────
// Right-to-erasure: permanently removes the candidate, their stored resume
// files, and (via FK cascades) applications, calls, evaluations, email logs,
// portal tokens, and re-engagement rows. Admin only — this is irreversible.

router.delete(
  '/:id',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const candidateId = req.params.id;

      const { data: candidate, error: candErr } = await supabaseAdmin
        .from('candidates')
        .select('id')
        .eq('id', candidateId)
        .eq('org_id', req.user!.org_id)
        .single();

      if (candErr || !candidate) throw new AppError(404, 'Candidate not found');

      // Storage doesn't cascade — remove every file under the candidate's prefix.
      // Failures here are FATAL (same rule as the 0-row delete below): this runs
      // before the row delete, so a 500 leaves the candidate intact and the
      // admin retries the whole erasure — never a deleted row with orphaned PII
      // files left in the bucket.
      const prefix = `${req.user!.org_id}/${candidateId}`;
      const { data: files, error: listErr } = await supabaseAdmin.storage.from('resumes').list(prefix);
      if (listErr) {
        logger.error(`Failed to list resume files for ${candidateId}:`, listErr);
        throw new AppError(500, 'Failed to enumerate stored resume files — erasure aborted');
      }
      if (files?.length) {
        const paths = files.map((f) => `${prefix}/${f.name}`);
        const { error: rmErr } = await supabaseAdmin.storage.from('resumes').remove(paths);
        if (rmErr) {
          logger.error(`Failed to remove resume files for ${candidateId}:`, rmErr);
          throw new AppError(500, 'Failed to remove stored resume files — erasure aborted');
        }
      }

      // The CEIPAL intake ledger keeps its rows on candidate delete (the FK is
      // SET NULL — deleting them would break dedup and let the mail poller
      // re-ingest, resurrecting the erased candidate). Scrub the PII-bearing
      // columns instead, BEFORE the row delete severs candidate_id.
      const { error: scrubErr } = await supabaseAdmin
        .from('ceipal_submissions')
        .update({ raw: null, error: null })
        .eq('org_id', req.user!.org_id)
        .eq('candidate_id', candidateId);
      if (scrubErr) {
        logger.error(`Failed to scrub ceipal_submissions for ${candidateId}:`, scrubErr);
        throw new AppError(500, 'Failed to scrub intake ledger — erasure aborted');
      }

      // .select('id') makes the delete PROVE it removed rows — a 0-row delete
      // must be a loud error, never a silent success (an erasure that doesn't
      // erase is worse than a failure: the caller believes the PII is gone).
      const { data: deletedRows, error: delErr } = await supabaseAdmin
        .from('candidates')
        .delete()
        .eq('id', candidateId)
        .eq('org_id', req.user!.org_id)
        .select('id');

      if (delErr) throw new AppError(500, `Failed to delete candidate: ${delErr.message}`);
      if (!deletedRows?.length) {
        logger.error(`Candidate delete affected 0 rows (id=${candidateId}, org=${req.user!.org_id})`);
        throw new AppError(500, 'Delete affected no rows — candidate was not removed');
      }

      // Log the erasure by id only — the point is to stop holding their PII.
      await supabaseAdmin.from('activity_log').insert({
        org_id: req.user!.org_id,
        user_id: req.user!.id,
        entity_type: 'candidate',
        entity_id: candidateId,
        action: 'deleted',
        details: { reason: 'erasure', files_removed: files?.length ?? 0 },
      });

      logger.info(`Candidate ${candidateId} deleted (erasure) by user ${req.user!.id}`);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
