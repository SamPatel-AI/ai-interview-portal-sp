import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { supabaseAdmin } from '../config/database';
import { AppError } from '../middleware/errorHandler';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Portal Auth Middleware ────────────────────────────────
// Validates portal token from query param or header

async function portalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = (req.query.token as string) || req.headers['x-portal-token'] as string;
    if (!token) throw new AppError(401, 'Portal token required');

    const { data, error } = await supabaseAdmin
      .from('candidate_portal_tokens')
      .select('candidate_id, expires_at')
      .eq('token', token)
      .single();

    if (error || !data) throw new AppError(401, 'Invalid portal token');

    if (new Date(data.expires_at) < new Date()) {
      throw new AppError(401, 'Portal token has expired');
    }

    (req as any).candidateId = data.candidate_id;
    next();
  } catch (err) {
    next(err instanceof AppError ? err : new AppError(401, 'Invalid portal token'));
  }
}

// ─── POST /api/portal/generate-token ───────────────────────
// (Called by backend internally or admin — generates portal access for a candidate)

router.post('/generate-token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { candidate_id, expires_hours = 72 } = req.body;
    if (!candidate_id) throw new AppError(400, 'candidate_id required');

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expires_hours * 60 * 60 * 1000);

    const { data, error } = await supabaseAdmin
      .from('candidate_portal_tokens')
      .insert({
        candidate_id,
        token,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (error) throw new AppError(500, 'Failed to generate token');

    res.status(201).json({ success: true, data: { token: data.token, expires_at: data.expires_at } });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/portal/status ────────────────────────────────
// Candidate views their interview status

router.get('/status', portalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const candidateId = (req as any).candidateId;

    const { data: candidate } = await supabaseAdmin
      .from('candidates')
      .select('first_name, last_name, email')
      .eq('id', candidateId)
      .single();

    const { data: applications } = await supabaseAdmin
      .from('applications')
      .select(`
        id, status, created_at,
        jobs (title, client_companies (name))
      `)
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: false });

    const { data: calls } = await supabaseAdmin
      .from('calls')
      .select('id, status, scheduled_at, duration_seconds, started_at')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: false })
      .limit(10);

    res.json({
      success: true,
      data: {
        candidate,
        applications: (applications || []).map((a: any) => ({
          id: a.id,
          job_title: a.jobs?.title,
          company: a.jobs?.client_companies?.name,
          status: a.status,
          applied_at: a.created_at,
        })),
        upcoming_calls: (calls || []).filter(c => c.status === 'scheduled'),
        completed_calls: (calls || []).filter(c => c.status === 'completed').length,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/portal/resume ───────────────────────────────
// Candidate uploads an updated resume

router.post('/resume', portalAuth, upload.single('resume'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new AppError(400, 'No file uploaded');

    const candidateId = (req as any).candidateId;

    const { data: candidate } = await supabaseAdmin
      .from('candidates')
      .select('org_id')
      .eq('id', candidateId)
      .single();

    if (!candidate) throw new AppError(404, 'Candidate not found');

    const filePath = `${candidate.org_id}/${candidateId}/${req.file.originalname}`;
    const { error: uploadErr } = await supabaseAdmin.storage
      .from('resumes')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });

    if (uploadErr) throw new AppError(500, 'Failed to upload resume');

    await supabaseAdmin
      .from('candidates')
      .update({ resume_url: filePath })
      .eq('id', candidateId);

    res.json({ success: true, data: { message: 'Resume updated successfully' } });
  } catch (err) {
    next(err);
  }
});

export default router;
