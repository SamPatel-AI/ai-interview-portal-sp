import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { supabaseAdmin } from './config/database';
import { logger } from './utils/logger';
import { runStartupChecks } from './config/startupChecks';
import { errorHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiter';

// Route imports
import authRoutes from './routes/auth.routes';
import candidateRoutes from './routes/candidates.routes';
import jobRoutes from './routes/jobs.routes';
import applicationRoutes from './routes/applications.routes';
import agentRoutes from './routes/agents.routes';
import callRoutes from './routes/calls.routes';
import companyRoutes from './routes/companies.routes';
import webhookRoutes from './routes/webhooks.routes';
import analyticsRoutes from './routes/analytics.routes';
import emailRoutes from './routes/emails.routes';
import activityRoutes from './routes/activity.routes';
import userRoutes from './routes/users.routes';
import settingsRoutes from './routes/settings.routes';
import reportsRoutes from './routes/reports.routes';
import portalRoutes from './routes/portal.routes';
import clientPortalRoutes from './routes/clientPortal.routes';
import reengagementRoutes from './routes/reengagement.routes';
import { startReengagementScheduler } from './jobs/reengagement.job';

// Side-effect imports — BullMQ workers auto-start on module instantiation
import { emailQueue, emailWorker } from './jobs/emailSender.job';
import { callRetryQueue, callRetryWorker } from './jobs/callRetry.job';
import { callSchedulerQueue, callSchedulerWorker, pollScheduledCalls } from './jobs/callScheduler.job';
import { ceipalSyncQueue, ceipalSyncWorker, startRecurringCeipalSync } from './jobs/ceipalSync.job';
import { resumeQueue, resumeWorker } from './jobs/resumeProcessor.job';
import { reengagementQueue, reengagementWorker } from './jobs/reengagement.job';
import { ceipalMailQueue, ceipalMailWorker, startRecurringCeipalMailPoll } from './jobs/ceipalMailPoll.job';
import { redis } from './config/redis';

const app = express();

// Behind Railway's proxy: trust exactly one hop so req.ip is the CLIENT
// address, not the proxy's. Without this the rate limiter keys every user
// onto the proxy IP — one shared bucket for all traffic.
app.set('trust proxy', 1);

// --- Global middleware ---
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = env.FRONTEND_URL
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Webhooks need raw body for signature verification - mount BEFORE json parser
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('short', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));
app.use('/api', apiLimiter);

// --- Health checks ---
// /health = liveness (shallow; Railway's deploy healthcheck hits this — it
// must not flap on a dependency blip). /health/ready = readiness: proves DB
// and Redis are actually reachable; 503 with per-dependency detail when not.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/health/ready', async (_req, res) => {
  const checks: Record<string, string> = {};

  await Promise.all([
    supabaseAdmin
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .then(({ error }) => { checks.database = error ? `error: ${error.message}` : 'ok'; }),
    redis
      .ping()
      .then(() => { checks.redis = 'ok'; })
      .catch((err: Error) => { checks.redis = `error: ${err.message}`; }),
  ]);

  const healthy = Object.values(checks).every((v) => v === 'ok');
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  });
});

// --- API routes ---
app.use('/api/auth', authRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/users', userRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/portal', portalRoutes);
app.use('/api/client-portal', clientPortalRoutes);
app.use('/api/reengagement', reengagementRoutes);

// --- 404 handler ---
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// --- Error handler ---
app.use(errorHandler);

// --- Start server ---
let pollTimer: NodeJS.Timeout | undefined;
const PORT = parseInt(env.PORT, 10);
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${env.NODE_ENV} mode`);

  // Loud config diagnostics (email transport, webhook auth, Cal.com API).
  runStartupChecks();

  // Start background job schedulers
  startReengagementScheduler().catch(err => {
    logger.error('Failed to start re-engagement scheduler:', err);
  });

  // Sync CEIPAL jobs every 30 min for all orgs (keeps jobs + ceipal_job_uuid
  // current so inbound submissions can match newly-posted jobs).
  startRecurringCeipalSync().catch(err => {
    logger.error('Failed to start CEIPAL job sync:', err);
  });

  // Poll the AISaanviHR inbox for CEIPAL notification emails (candidate
  // intake — the CEIPAL API itself exposes no job-board applications).
  startRecurringCeipalMailPoll().catch(err => {
    logger.error('Failed to start CEIPAL mail poll:', err);
  });

  // Promote due scheduled calls (cal.com bookings, post-call callbacks) into the
  // call-scheduler queue every minute. Without this, scheduled calls never dial.
  const SCHEDULED_CALL_POLL_MS = 60_000;
  pollTimer = setInterval(() => {
    pollScheduledCalls().catch(err => {
      logger.error('pollScheduledCalls failed:', err);
    });
  }, SCHEDULED_CALL_POLL_MS);
  pollScheduledCalls().catch(err => logger.error('initial pollScheduledCalls failed:', err));
  logger.info(`Scheduled-call poller started (every ${SCHEDULED_CALL_POLL_MS / 1000}s)`);
});

// --- Graceful shutdown ---
// Railway sends SIGTERM on every redeploy. Without this, in-flight HTTP
// requests are severed and BullMQ jobs die mid-run (a half-placed call, a
// half-sent email) and get retried by the next container — drops and dupes.
// Order: stop taking HTTP → stop the poller → drain workers → close queue
// producers and Redis → exit.
const workers = [
  emailWorker, callRetryWorker, callSchedulerWorker,
  ceipalSyncWorker, resumeWorker, reengagementWorker, ceipalMailWorker,
];
const queues = [
  emailQueue, callRetryQueue, callSchedulerQueue,
  ceipalSyncQueue, resumeQueue, reengagementQueue, ceipalMailQueue,
];

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received — shutting down gracefully`);

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out after 25s — forcing exit');
    process.exit(1);
  }, 25_000);
  forceExit.unref();

  if (pollTimer) clearInterval(pollTimer);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await Promise.allSettled(workers.map((w) => w.close()));
  await Promise.allSettled(queues.map((q) => q.close()));
  await redis.quit().catch(() => { /* already closed */ });

  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });

export default app;
