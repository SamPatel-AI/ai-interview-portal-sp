import { env } from './env';
import { logger } from '../utils/logger';

/**
 * Loud, fail-fast-ish startup diagnostics for the email + scheduling loop.
 *
 * These never throw (the server should still boot in degraded/dev modes), but
 * they emit prominent warnings so misconfiguration is never silent — e.g.
 * EMAIL_TRANSPORT=graph with no Graph credentials would otherwise log every
 * invite as "failed" with no obvious cause, and an unset webhook secret leaves
 * the Cal.com / intake webhooks open.
 */
export function runStartupChecks(): void {
  // ── Email transport ──────────────────────────────────────
  if (env.EMAIL_TRANSPORT === 'graph') {
    const missing = [
      ['MS_GRAPH_TENANT_ID', env.MS_GRAPH_TENANT_ID],
      ['MS_GRAPH_CLIENT_ID', env.MS_GRAPH_CLIENT_ID],
      ['MS_GRAPH_CLIENT_SECRET', env.MS_GRAPH_CLIENT_SECRET],
      ['MS_GRAPH_SENDER', env.MS_GRAPH_SENDER || env.SMTP_FROM],
    ].filter(([, v]) => !v).map(([k]) => k);

    if (missing.length > 0) {
      logger.error(
        `⚠️  EMAIL_TRANSPORT=graph but missing required Graph config: ${missing.join(', ')}. ` +
        `Invitations WILL FAIL to send (logged as status='failed'). Set these in backend/.env.`,
      );
    } else {
      logger.info(`Email transport: Microsoft Graph (sender: ${env.MS_GRAPH_SENDER || env.SMTP_FROM})`);
    }
  } else if (env.EMAIL_TRANSPORT === 'smtp') {
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
      logger.warn('EMAIL_TRANSPORT=smtp but SMTP_HOST/USER/PASS incomplete — emails will fall back to log mode.');
    } else {
      logger.info('Email transport: SMTP');
    }
  } else {
    logger.warn('Email transport: LOG ONLY — invitations are written to logs, not delivered (dev mode).');
  }

  // ── Webhook authentication ───────────────────────────────
  if (!env.WEBHOOK_SHARED_SECRET) {
    logger.warn(
      '⚠️  WEBHOOK_SHARED_SECRET is not set — /api/webhooks/cal-booking and /candidate-intake are ' +
      'UNAUTHENTICATED (anyone can POST). Set it and configure Cal.com to send the x-webhook-secret header.',
    );
  }

  // ── CEIPAL submissions intake (candidate poller) ─────────
  if (!env.CEIPAL_API_KEY || !env.CEIPAL_EMAIL || !env.CEIPAL_PASSWORD) {
    logger.warn(
      'CEIPAL credentials incomplete (CEIPAL_API_KEY/EMAIL/PASSWORD) — the CEIPAL submissions ' +
      'poller (candidate intake) will NOT run. Set them in backend/.env.',
    );
  } else if (!env.DEFAULT_ORG_ID) {
    logger.warn(
      '⚠️  DEFAULT_ORG_ID is not set — the CEIPAL submissions poller cannot resolve an org and ' +
      'will NOT run. Set it to the Saanvi org id in backend/.env.',
    );
  } else {
    logger.info(
      `CEIPAL submissions intake: polling every ${env.CEIPAL_SUBMISSIONS_POLL_MINUTES}m for org ${env.DEFAULT_ORG_ID}`,
    );
  }

  // ── Cal.com API (deadline backstop + availability) ───────
  if (!env.CAL_API_KEY) {
    logger.warn(
      'CAL_API_KEY is not set — the deadline backstop cannot cancel late Cal.com bookings and per-job ' +
      'availability cannot be driven into Cal.com. Late bookings will be rejected but not cancelled upstream.',
    );
  } else if (!env.CAL_EVENT_TYPE_ID) {
    logger.warn('CAL_EVENT_TYPE_ID is not set — per-job Cal.com availability windows will be skipped.');
  }
}
