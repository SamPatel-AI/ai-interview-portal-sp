import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
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
import './jobs/emailSender.job';
import './jobs/callRetry.job';
import './jobs/callScheduler.job';
import { pollScheduledCalls } from './jobs/callScheduler.job';
import './jobs/ceipalSync.job';
import { startRecurringCeipalSync } from './jobs/ceipalSync.job';
import './jobs/resumeProcessor.job';
import { startRecurringCeipalMailPoll } from './jobs/ceipalMailPoll.job';

const app = express();

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

// --- Health check ---
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
const PORT = parseInt(env.PORT, 10);
app.listen(PORT, () => {
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
  setInterval(() => {
    pollScheduledCalls().catch(err => {
      logger.error('pollScheduledCalls failed:', err);
    });
  }, SCHEDULED_CALL_POLL_MS);
  pollScheduledCalls().catch(err => logger.error('initial pollScheduledCalls failed:', err));
  logger.info(`Scheduled-call poller started (every ${SCHEDULED_CALL_POLL_MS / 1000}s)`);
});

export default app;
