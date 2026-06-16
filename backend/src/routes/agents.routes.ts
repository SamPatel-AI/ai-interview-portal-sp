import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/database';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import '../types';
import {
  syncAgentToRetell,
  deleteRetellAgent,
  listVoices,
  createOutboundCall,
} from '../services/retell.service';
import { compileSystemPrompt, buildSampleVariables } from '../utils/retellPromptBuilder';
import { agentBodySchema, updateAgentBodySchema } from './agents.schema';
import { env } from '../config/env';

const router = Router();

router.use(authenticate);

// ─── Helpers ───────────────────────────────────────────────

function postCallWebhookUrl(): string {
  return env.NODE_ENV === 'production'
    ? `${env.FRONTEND_URL.replace('://app.', '://api.')}/api/webhooks/retell/post-call`
    : `${env.FRONTEND_URL}/api/webhooks/retell/post-call`;
}

/**
 * Persist a sync result to the agent row. Scoped by org_id for defense-in-depth
 * (the row was already org-verified upstream, but service-role queries bypass RLS).
 */
async function applySyncResult(agentId: string, orgId: string, sync: Awaited<ReturnType<typeof syncAgentToRetell>>) {
  const { data } = await supabaseAdmin
    .from('ai_agents')
    .update({
      retell_llm_id: sync.retell_llm_id,
      retell_agent_id: sync.retell_agent_id,
      sync_status: sync.sync_status,
      sync_error: sync.sync_error,
      last_synced_at: sync.last_synced_at,
    })
    .eq('id', agentId)
    .eq('org_id', orgId)
    .select()
    .single();
  return data;
}

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
        users!ai_agents_created_by_fkey (id, full_name),
        jobs (count)
      `, { count: 'exact' })
      .eq('org_id', req.user!.org_id)
      .order('created_at', { ascending: false });

    if (company_id) query = query.eq('client_company_id', company_id);
    if (active_only === 'true') query = query.eq('is_active', true);

    const { data, error, count } = await query;

    if (error) throw new AppError(500, 'Failed to fetch agents');

    const enriched = (data ?? []).map((a: any) => ({
      ...a,
      jobs_count: a.jobs?.[0]?.count ?? 0,
      jobs: undefined,
    }));

    res.json({ success: true, data: enriched, total: count });
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
      const body = agentBodySchema.parse(req.body);
      const system_prompt = body.builder_config ? compileSystemPrompt(body.builder_config) : body.system_prompt!;

      const { data: row, error } = await supabaseAdmin
        .from('ai_agents')
        .insert({
          name: body.name,
          client_company_id: body.client_company_id ?? null,
          voice_id: body.voice_id,
          language: body.language,
          interview_style: body.interview_style,
          max_call_duration_sec: body.max_call_duration_sec,
          evaluation_criteria: body.evaluation_criteria ?? {},
          greeting_template: body.greeting_template ?? null,
          closing_template: body.closing_template ?? null,
          builder_config: body.builder_config ?? null,
          system_prompt,
          is_active: body.is_active ?? true,
          org_id: req.user!.org_id,
          created_by: req.user!.id,
          sync_status: 'pending',
        })
        .select()
        .single();
      if (error || !row) throw new AppError(500, 'Failed to save agent');

      const sync = await syncAgentToRetell(row, postCallWebhookUrl());
      const synced = await applySyncResult(row.id, req.user!.org_id, sync);

      await supabaseAdmin.from('activity_log').insert({
        org_id: req.user!.org_id, user_id: req.user!.id,
        entity_type: 'ai_agent', entity_id: row.id, action: 'created',
        details: { name: body.name, sync_status: sync.sync_status },
      });

      res.status(201).json({ success: true, data: synced ?? row });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/agents/:id ─────────────────────────────────

// NOTE: PATCH expects the FULL agent definition (the builder wizard always submits
// the whole form). It recompiles the prompt and re-syncs to Retell, and writes
// builder_config wholesale — a partial body would wipe builder_config / system_prompt.
router.patch(
  '/:id',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = updateAgentBodySchema.parse(req.body);
      const { data: existing, error: fetchErr } = await supabaseAdmin
        .from('ai_agents')
        .select('*')
        .eq('id', req.params.id)
        .eq('org_id', req.user!.org_id)
        .single();
      if (fetchErr || !existing) throw new AppError(404, 'Agent not found');

      const system_prompt = body.builder_config ? compileSystemPrompt(body.builder_config) : body.system_prompt!;

      const { data: row, error } = await supabaseAdmin
        .from('ai_agents')
        .update({
          name: body.name,
          client_company_id: body.client_company_id ?? null,
          voice_id: body.voice_id,
          language: body.language,
          interview_style: body.interview_style,
          max_call_duration_sec: body.max_call_duration_sec,
          evaluation_criteria: body.evaluation_criteria ?? existing.evaluation_criteria,
          greeting_template: body.greeting_template ?? null,
          closing_template: body.closing_template ?? null,
          builder_config: body.builder_config ?? null,
          system_prompt,
          is_active: body.is_active ?? existing.is_active,
        })
        .eq('id', req.params.id)
        .select()
        .single();
      if (error || !row) throw new AppError(500, 'Failed to update agent');

      const sync = await syncAgentToRetell(row, postCallWebhookUrl());
      const synced = await applySyncResult(row.id, req.user!.org_id, sync);

      res.json({ success: true, data: synced ?? row });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/agents/:id/sync ─────────────────────────────

router.post('/:id/sync', requireRole('admin', 'recruiter'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data: row, error } = await supabaseAdmin
      .from('ai_agents')
      .select('*')
      .eq('id', req.params.id)
      .eq('org_id', req.user!.org_id)
      .single();
    if (error || !row) throw new AppError(404, 'Agent not found');

    const sync = await syncAgentToRetell(row, postCallWebhookUrl());
    const synced = await applySyncResult(row.id, req.user!.org_id, sync);

    if (sync.sync_status === 'error') throw new AppError(502, `Retell sync failed: ${sync.sync_error}`);
    res.json({ success: true, data: synced });
  } catch (err) { next(err); }
});

// ─── POST /api/agents/:id/test-call ───────────────────────

const testCallSchema = z.object({ phone_number: z.string().min(8).max(20) });

router.post('/:id/test-call', requireRole('admin', 'recruiter'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone_number } = testCallSchema.parse(req.body);
    const { data: row, error } = await supabaseAdmin
      .from('ai_agents')
      .select('retell_agent_id, name, client_companies(name)')
      .eq('id', req.params.id)
      .eq('org_id', req.user!.org_id)
      .single();
    if (error || !row) throw new AppError(404, 'Agent not found');
    if (!row.retell_agent_id) throw new AppError(409, 'Sync the agent first before testing.');

    const companyName = (row as any).client_companies?.name as string | undefined;
    const vars = buildSampleVariables({ companyName });

    const call = await createOutboundCall({
      agentId: row.retell_agent_id,
      toNumber: phone_number,
      dynamicVariables: vars,
      metadata: { test: 'true' },
    });

    res.json({ success: true, data: { call_id: call.callId, status: call.status } });
  } catch (err) { next(err); }
});

// ─── DELETE /api/agents/:id ────────────────────────────────

router.delete(
  '/:id',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { data: existing, error: fetchErr } = await supabaseAdmin
        .from('ai_agents')
        .select('retell_agent_id, retell_llm_id')
        .eq('id', req.params.id)
        .eq('org_id', req.user!.org_id)
        .single();

      if (fetchErr || !existing) throw new AppError(404, 'Agent not found');

      // Deactivate in Retell
      if (existing.retell_agent_id) {
        try {
          await deleteRetellAgent(existing.retell_agent_id, existing.retell_llm_id);
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
