import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/database';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import '../types';
import {
  createRetellAgent,
  updateRetellAgent,
  deleteRetellAgent,
  listVoices,
} from '../services/retell.service';
import { env } from '../config/env';

const router = Router();

router.use(authenticate);

// ─── Validation ────────────────────────────────────────────

const createAgentSchema = z.object({
  name: z.string().min(1),
  client_company_id: z.string().uuid().optional(),
  system_prompt: z.string().min(10),
  voice_id: z.string().min(1),
  language: z.string().default('en-US'),
  interview_style: z.enum(['formal', 'conversational', 'technical']).default('conversational'),
  max_call_duration_sec: z.number().int().min(60).max(3600).default(1200),
  evaluation_criteria: z.record(z.unknown()).optional(),
  greeting_template: z.string().optional(),
  closing_template: z.string().optional(),
  fallback_behavior: z.record(z.unknown()).optional(),
});

const updateAgentSchema = createAgentSchema.partial();

// ─── GET /api/agents/voices ────────────────────────────────
// List available Retell voices (must be before /:id)

router.get('/voices', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const voices = await listVoices();
    res.json({ success: true, data: voices });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/agents ───────────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { company_id, active_only } = req.query;

    let query = supabaseAdmin
      .from('ai_agents')
      .select(`
        *,
        client_companies (id, name),
        users!ai_agents_created_by_fkey (id, full_name)
      `, { count: 'exact' })
      .eq('org_id', req.user!.org_id)
      .order('created_at', { ascending: false });

    if (company_id) query = query.eq('client_company_id', company_id);
    if (active_only === 'true') query = query.eq('is_active', true);

    const { data, error, count } = await query;

    if (error) throw new AppError(500, 'Failed to fetch agents');

    res.json({ success: true, data, total: count });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/agents/:id ───────────────────────────────────

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('ai_agents')
      .select(`
        *,
        client_companies (id, name),
        users!ai_agents_created_by_fkey (id, full_name),
        jobs (id, title, status)
      `)
      .eq('id', req.params.id)
      .eq('org_id', req.user!.org_id)
      .single();

    if (error || !data) throw new AppError(404, 'Agent not found');

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/agents ──────────────────────────────────────

router.post(
  '/',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createAgentSchema.parse(req.body);

      // Determine webhook URL for this environment
      const webhookUrl = env.NODE_ENV === 'production'
        ? `${env.FRONTEND_URL.replace('://app.', '://api.')}/api/webhooks/retell/post-call`
        : `${env.FRONTEND_URL}/api/webhooks/retell/post-call`;

      // Create agent in Retell
      const retellAgentId = await createRetellAgent({
        name: body.name,
        systemPrompt: body.system_prompt,
        voiceId: body.voice_id,
        language: body.language,
        maxCallDurationSec: body.max_call_duration_sec,
        greetingTemplate: body.greeting_template,
        webhookUrl,
      });

      // Save to our database
      const { data, error } = await supabaseAdmin
        .from('ai_agents')
        .insert({
          ...body,
          org_id: req.user!.org_id,
          retell_agent_id: retellAgentId,
          created_by: req.user!.id,
        })
        .select()
        .single();

      if (error) throw new AppError(500, 'Failed to save agent');

      await supabaseAdmin.from('activity_log').insert({
        org_id: req.user!.org_id,
        user_id: req.user!.id,
        entity_type: 'ai_agent',
        entity_id: data.id,
        action: 'created',
        details: { name: body.name, retell_agent_id: retellAgentId },
      });

      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/agents/:id ─────────────────────────────────

router.patch(
  '/:id',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = updateAgentSchema.parse(req.body);

      // Fetch existing agent to get retell_agent_id
      const { data: existing, error: fetchErr } = await supabaseAdmin
        .from('ai_agents')
        .select('retell_agent_id')
        .eq('id', req.params.id)
        .eq('org_id', req.user!.org_id)
        .single();

      if (fetchErr || !existing) throw new AppError(404, 'Agent not found');

      // Update in Retell if it has a retell_agent_id
      if (existing.retell_agent_id) {
        await updateRetellAgent(existing.retell_agent_id, {
          name: body.name,
          voiceId: body.voice_id,
          language: body.language,
          maxCallDurationSec: body.max_call_duration_sec,
        });
      }

      // Update in our database
      const { data, error } = await supabaseAdmin
        .from('ai_agents')
        .update(body)
        .eq('id', req.params.id)
        .eq('org_id', req.user!.org_id)
        .select()
        .single();

      if (error || !data) throw new AppError(500, 'Failed to update agent');

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /api/agents/:id ────────────────────────────────

router.delete(
  '/:id',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { data: existing, error: fetchErr } = await supabaseAdmin
        .from('ai_agents')
        .select('retell_agent_id')
        .eq('id', req.params.id)
        .eq('org_id', req.user!.org_id)
        .single();

      if (fetchErr || !existing) throw new AppError(404, 'Agent not found');

      // Deactivate in Retell
      if (existing.retell_agent_id) {
        try {
          await deleteRetellAgent(existing.retell_agent_id);
        } catch {
          // Continue even if Retell deletion fails
        }
      }

      // Soft delete - deactivate
      await supabaseAdmin
        .from('ai_agents')
        .update({ is_active: false })
        .eq('id', req.params.id);

      res.json({ success: true, message: 'Agent deactivated' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
