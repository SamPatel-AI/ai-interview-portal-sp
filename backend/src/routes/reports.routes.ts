import { Router, Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import '../types';

const router = Router();

router.use(authenticate);

// ─── GET /api/reports/export ───────────────────────────────
// Export data as CSV: type=candidates|applications|calls|jobs

router.get(
  '/export',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type } = req.query;
      const orgId = req.user!.org_id;

      let rows: string[][] = [];
      let headers: string[] = [];

      switch (type) {
        case 'candidates': {
          headers = ['Name', 'Email', 'Phone', 'Location', 'Source', 'Created'];
          const { data } = await supabaseAdmin
            .from('candidates')
            .select('first_name, last_name, email, phone, location, source, created_at')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false });
          rows = (data || []).map(c => [
            `${c.first_name} ${c.last_name}`, c.email, c.phone || '', c.location || '',
            c.source || '', new Date(c.created_at).toLocaleDateString(),
          ]);
          break;
        }
        case 'applications': {
          headers = ['Candidate', 'Email', 'Job', 'Status', 'AI Score', 'Created'];
          const { data } = await supabaseAdmin
            .from('applications')
            .select('status, ai_screening_score, created_at, candidates (first_name, last_name, email), jobs (title)')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false });
          rows = (data || []).map((a: any) => [
            `${a.candidates?.first_name || ''} ${a.candidates?.last_name || ''}`,
            a.candidates?.email || '', a.jobs?.title || '', a.status,
            a.ai_screening_score?.toString() || '', new Date(a.created_at).toLocaleDateString(),
          ]);
          break;
        }
        case 'calls': {
          headers = ['Candidate', 'Job', 'Agent', 'Direction', 'Status', 'Duration (sec)', 'Date'];
          const { data } = await supabaseAdmin
            .from('calls')
            .select('direction, status, duration_seconds, created_at, candidates (first_name, last_name), ai_agents (name), applications (jobs (title))')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false });
          rows = (data || []).map((c: any) => [
            `${c.candidates?.first_name || ''} ${c.candidates?.last_name || ''}`,
            c.applications?.jobs?.title || '', c.ai_agents?.name || '', c.direction, c.status,
            c.duration_seconds?.toString() || '', new Date(c.created_at).toLocaleDateString(),
          ]);
          break;
        }
        case 'jobs': {
          headers = ['Title', 'Company', 'Status', 'Priority', 'Employment Type', 'Location', 'Created'];
          const { data } = await supabaseAdmin
            .from('jobs')
            .select('title, status, employment_type, location, state, country, priority, created_at, client_companies (name)')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false });
          rows = (data || []).map((j: any) => [
            j.title, j.client_companies?.name || '', j.status, j.priority || 'normal',
            j.employment_type, [j.location, j.state, j.country].filter(Boolean).join(', '),
            new Date(j.created_at).toLocaleDateString(),
          ]);
          break;
        }
        default:
          throw new AppError(400, 'Invalid export type. Use: candidates, applications, calls, jobs');
      }

      // Build CSV
      const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;
      const csv = [
        headers.map(escapeCsv).join(','),
        ...rows.map(row => row.map(escapeCsv).join(',')),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-export-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/reports/candidate/:id ───────────────────────
// Generate AI executive summary report for a candidate

router.post(
  '/candidate/:id',
  requireRole('admin', 'recruiter'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.org_id;
      const candidateId = req.params.id;

      // Fetch candidate with all related data
      const { data: candidate, error: candErr } = await supabaseAdmin
        .from('candidates')
        .select('*')
        .eq('id', candidateId)
        .eq('org_id', orgId)
        .single();

      if (candErr || !candidate) throw new AppError(404, 'Candidate not found');

      // Fetch applications with screening results
      const { data: applications } = await supabaseAdmin
        .from('applications')
        .select(`
          id, status, ai_screening_score, ai_screening_result,
          jobs (title, description, skills, client_companies (name))
        `)
        .eq('candidate_id', candidateId)
        .eq('org_id', orgId);

      // Fetch calls with transcripts and evaluations
      const { data: calls } = await supabaseAdmin
        .from('calls')
        .select(`
          id, status, duration_seconds, transcript, call_analysis,
          call_evaluations (decision, rating, notes)
        `)
        .eq('candidate_id', candidateId)
        .eq('org_id', orgId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(5);

      // Build the report data (structured JSON — can be rendered to PDF on frontend)
      const report = {
        candidate: {
          name: `${candidate.first_name} ${candidate.last_name}`,
          email: candidate.email,
          phone: candidate.phone,
          location: candidate.location,
          work_authorization: candidate.work_authorization,
        },
        applications: (applications || []).map((app: any) => ({
          job_title: app.jobs?.title,
          company: app.jobs?.client_companies?.name,
          status: app.status,
          ai_score: app.ai_screening_score,
          screening_result: app.ai_screening_result,
        })),
        interviews: (calls || []).map((call: any) => ({
          duration_minutes: Math.round((call.duration_seconds || 0) / 60),
          analysis: call.call_analysis,
          evaluations: call.call_evaluations,
          transcript_preview: call.transcript?.substring(0, 500),
        })),
        generated_at: new Date().toISOString(),
      };

      // If OpenRouter is configured, generate AI summary
      let ai_summary = null;
      try {
        const { generateCandidateReport } = await import('../services/report.service');
        ai_summary = await generateCandidateReport(report);
      } catch {
        // AI summary generation is optional — proceed without it
      }

      res.json({
        success: true,
        data: {
          ...report,
          ai_summary,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
