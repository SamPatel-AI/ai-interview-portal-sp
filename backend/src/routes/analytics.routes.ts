import { Router, Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import '../types';

const router = Router();

router.use(authenticate);

// ─── GET /api/analytics/overview ───────────────────────────
// Dashboard overview stats

router.get('/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.org_id;

    const [
      candidatesResult,
      jobsResult,
      applicationsResult,
      callsResult,
      callsTodayResult,
      pendingReviewResult,
      recentActivityResult,
      scheduledCallsResult,
      topJobsResult,
    ] = await Promise.all([
      // Total candidates
      supabaseAdmin.from('candidates').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
      // Open jobs
      supabaseAdmin.from('jobs').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'open'),
      // Application status breakdown
      supabaseAdmin
        .from('applications')
        .select('status')
        .eq('org_id', orgId),
      // Total calls
      supabaseAdmin.from('calls').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
      // Calls today
      supabaseAdmin.from('calls')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('created_at', new Date().toISOString().split('T')[0]),
      // Pending reviews (completed calls without evaluations)
      supabaseAdmin
        .from('calls')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'completed')
        .is('call_analysis', null),
      // Recent activity
      supabaseAdmin
        .from('activity_log')
        .select('id, entity_type, action, details, created_at, users (full_name)')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(20),
      // Scheduled calls (upcoming)
      supabaseAdmin
        .from('calls')
        .select('id, scheduled_at, candidates (first_name, last_name), jobs (title)')
        .eq('org_id', orgId)
        .eq('status', 'scheduled')
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(10),
      // Top jobs by application count
      supabaseAdmin
        .from('applications')
        .select('job_id, jobs (title)')
        .eq('org_id', orgId),
    ]);

    // Build pipeline from application statuses
    const statusMap: Record<string, string> = {
      new: 'New',
      screening: 'Screening',
      interviewed: 'Interviewed',
      shortlisted: 'Shortlisted',
      hired: 'Hired',
      rejected: 'Rejected',
    };
    const statusCounts: Record<string, number> = {};
    for (const app of applicationsResult.data ?? []) {
      const stage = statusMap[app.status] || app.status;
      statusCounts[stage] = (statusCounts[stage] || 0) + 1;
    }
    const pipeline = Object.entries(statusCounts).map(([stage, count]) => ({ stage, count }));

    // Build scheduled_calls
    const scheduled_calls = (scheduledCallsResult.data ?? []).map((c: any) => ({
      candidate: c.candidates
        ? `${c.candidates.first_name} ${c.candidates.last_name}`
        : 'Unknown',
      job: c.jobs?.title || 'N/A',
      time: c.scheduled_at
        ? new Date(c.scheduled_at).toLocaleString()
        : '',
      source: null,
    }));

    // Build top_jobs
    const jobCounts: Record<string, { name: string; apps: number }> = {};
    for (const app of topJobsResult.data ?? []) {
      const title = (app.jobs as any)?.title || 'Unknown';
      if (!jobCounts[app.job_id]) {
        jobCounts[app.job_id] = { name: title, apps: 0 };
      }
      jobCounts[app.job_id].apps++;
    }
    const top_jobs = Object.values(jobCounts)
      .sort((a, b) => b.apps - a.apps)
      .slice(0, 5);

    res.json({
      success: true,
      data: {
        total_candidates: candidatesResult.count ?? 0,
        open_jobs: jobsResult.count ?? 0,
        total_calls: callsResult.count ?? 0,
        calls_today: callsTodayResult.count ?? 0,
        pending_reviews: pendingReviewResult.count ?? 0,
        pipeline,
        top_jobs,
        scheduled_calls,
        recent_activity: recentActivityResult.data ?? [],
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/analytics/recruiter/:id ──────────────────────

router.get('/recruiter/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const recruiterId = req.params.id;
    const orgId = req.user!.org_id;

    const [applicationsResult, callsResult, evaluationsResult] = await Promise.all([
      // Applications assigned to this recruiter
      supabaseAdmin
        .from('applications')
        .select('status', { count: 'exact' })
        .eq('org_id', orgId)
        .eq('assigned_recruiter_id', recruiterId),
      // Calls for recruiter's applications
      supabaseAdmin
        .from('calls')
        .select('status, duration_seconds, created_at')
        .eq('org_id', orgId)
        .in('application_id',
          (await supabaseAdmin
            .from('applications')
            .select('id')
            .eq('assigned_recruiter_id', recruiterId)
          ).data?.map(a => a.id) ?? []
        ),
      // Evaluations made by this recruiter
      supabaseAdmin
        .from('call_evaluations')
        .select('decision, rating, created_at')
        .eq('evaluated_by', recruiterId)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    // Calculate stats
    const calls = callsResult.data ?? [];
    const totalDuration = calls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0);
    const completedCalls = calls.filter(c => c.status === 'completed');

    res.json({
      success: true,
      data: {
        total_applications: applicationsResult.count ?? 0,
        total_calls: calls.length,
        completed_calls: completedCalls.length,
        total_call_duration_minutes: Math.round(totalDuration / 60),
        avg_call_duration_minutes: completedCalls.length > 0
          ? Math.round(totalDuration / completedCalls.length / 60)
          : 0,
        evaluations: evaluationsResult.data ?? [],
        call_success_rate: calls.length > 0
          ? Math.round((completedCalls.length / calls.length) * 100)
          : 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/analytics/job/:id ────────────────────────────

router.get('/job/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jobId = req.params.id;
    const orgId = req.user!.org_id;

    const [applicationsResult, callsResult, scoresResult] = await Promise.all([
      // Application count by status
      supabaseAdmin
        .from('applications')
        .select('status')
        .eq('org_id', orgId)
        .eq('job_id', jobId),
      // Call stats
      supabaseAdmin
        .from('calls')
        .select('status, duration_seconds')
        .eq('org_id', orgId)
        .in('application_id',
          (await supabaseAdmin
            .from('applications')
            .select('id')
            .eq('job_id', jobId)
          ).data?.map(a => a.id) ?? []
        ),
      // Screening scores
      supabaseAdmin
        .from('applications')
        .select('ai_screening_score')
        .eq('org_id', orgId)
        .eq('job_id', jobId)
        .not('ai_screening_score', 'is', null),
    ]);

    const apps = applicationsResult.data ?? [];
    const statusCounts = apps.reduce((acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const scores = (scoresResult.data ?? []).map(s => s.ai_screening_score).filter(Boolean) as number[];
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    res.json({
      success: true,
      data: {
        total_applications: apps.length,
        status_breakdown: statusCounts,
        total_calls: (callsResult.data ?? []).length,
        avg_screening_score: Math.round(avgScore * 10) / 10,
        score_distribution: scores,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/analytics/agent/:id ──────────────────────────

router.get('/agent/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agentId = req.params.id;
    const orgId = req.user!.org_id;

    const [callsResult, agentResult] = await Promise.all([
      supabaseAdmin
        .from('calls')
        .select('status, duration_seconds, direction, call_analysis, created_at')
        .eq('org_id', orgId)
        .eq('ai_agent_id', agentId),
      supabaseAdmin
        .from('ai_agents')
        .select('name, client_company_id, client_companies (name)')
        .eq('id', agentId)
        .single(),
    ]);

    const calls = callsResult.data ?? [];
    const completedCalls = calls.filter(c => c.status === 'completed');
    const totalDuration = completedCalls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0);

    // Sentiment breakdown from call_analysis
    const sentiments = completedCalls
      .map(c => (c.call_analysis as any)?.user_sentiment)
      .filter(Boolean);
    const sentimentCounts = sentiments.reduce((acc, s) => {
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      success: true,
      data: {
        agent_name: agentResult.data?.name || 'Unknown',
        company_name: (agentResult.data?.client_companies as any)?.name || null,
        total_calls: calls.length,
        completed_calls: completedCalls.length,
        success_rate: calls.length > 0
          ? Math.round((completedCalls.length / calls.length) * 100)
          : 0,
        avg_duration_minutes: completedCalls.length > 0
          ? Math.round(totalDuration / completedCalls.length / 60)
          : 0,
        total_duration_minutes: Math.round(totalDuration / 60),
        sentiment_breakdown: sentimentCounts,
        calls_by_status: calls.reduce((acc, c) => {
          acc[c.status] = (acc[c.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/analytics/recruiters ─────────────────────────
// All-recruiter workload comparison

router.get('/recruiters', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.org_id;

    // Get all active recruiters
    const { data: recruiters, error } = await supabaseAdmin
      .from('users')
      .select('id, full_name, email, role, avatar_url')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .in('role', ['admin', 'recruiter']);

    if (error) throw new AppError(500, 'Failed to fetch recruiters');

    // For each recruiter, get workload stats
    const workload = await Promise.all(
      (recruiters || []).map(async (recruiter) => {
        const [openApps, totalCalls, pendingEvals] = await Promise.all([
          // Open applications assigned to this recruiter
          supabaseAdmin
            .from('applications')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .eq('assigned_recruiter_id', recruiter.id)
            .in('status', ['new', 'screening', 'interviewed', 'shortlisted']),
          // Total calls for their applications
          supabaseAdmin
            .from('calls')
            .select('id, status', { count: 'exact' })
            .eq('org_id', orgId)
            .in('application_id',
              (await supabaseAdmin
                .from('applications')
                .select('id')
                .eq('assigned_recruiter_id', recruiter.id)
              ).data?.map(a => a.id) ?? []
            ),
          // Pending evaluations (completed calls without evaluations for their apps)
          supabaseAdmin
            .from('calls')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .eq('status', 'completed')
            .in('application_id',
              (await supabaseAdmin
                .from('applications')
                .select('id')
                .eq('assigned_recruiter_id', recruiter.id)
              ).data?.map(a => a.id) ?? []
            ),
        ]);

        return {
          ...recruiter,
          open_applications: openApps.count ?? 0,
          total_calls: totalCalls.count ?? 0,
          pending_evaluations: pendingEvals.count ?? 0,
        };
      })
    );

    res.json({ success: true, data: workload });
  } catch (err) {
    next(err);
  }
});

export default router;
