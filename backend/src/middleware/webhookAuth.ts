import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import Retell from 'retell-sdk';
import { env } from '../config/env';
import { logger } from '../utils/logger';

function rawBodyString(req: Request): string {
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (typeof req.body === 'string') return req.body;
  return JSON.stringify(req.body);
}

// Retell signs webhook payloads with your API key (x-retell-signature header).
// If RETELL_API_KEY is not configured (local dev without Retell), requests pass
// with a warning so the demo flow keeps working.
export function verifyRetellSignature(req: Request, res: Response, next: NextFunction): void {
  if (!env.RETELL_API_KEY) {
    logger.warn('RETELL_API_KEY not set — skipping Retell webhook signature verification');
    next();
    return;
  }

  const signature = req.headers['x-retell-signature'];
  if (typeof signature !== 'string' || !Retell.verify(rawBodyString(req), env.RETELL_API_KEY, signature)) {
    logRetellRejectDiagnostics(req, signature);
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  next();
}

// Prod webhooks are being rejected even for calls the deployed backend placed
// itself, so the mechanism (not key drift between environments) is suspect.
// The signature is `v=<ts>,d=hmac-sha256(API_KEY, rawBody + ts)`; this logs
// which stage disagrees — format, timestamp window, or digest — WITHOUT ever
// logging the secret, the body, or a full usable signature.
function logRetellRejectDiagnostics(req: Request, signature: unknown): void {
  const parts: string[] = [];
  if (typeof signature !== 'string') {
    parts.push(`signature header missing/not-string (type=${typeof signature})`);
  } else {
    const m = /v=(\d+),d=(.*)/.exec(signature);
    if (!m) {
      parts.push(`signature format unrecognized (len=${signature.length})`);
    } else {
      const ageMs = Date.now() - Number(m[1]);
      parts.push(`sig timestamp age=${ageMs}ms (limit 300000)`);
      const body = rawBodyString(req);
      const expected = crypto
        .createHmac('sha256', env.RETELL_API_KEY)
        .update(body + m[1])
        .digest('hex');
      parts.push(`digest match=${expected === m[2]} (got ${m[2].slice(0, 8)}…, expected ${expected.slice(0, 8)}…)`);
    }
  }
  parts.push(
    `content-type=${req.headers['content-type']}`,
    `body isBuffer=${Buffer.isBuffer(req.body)} len=${rawBodyString(req).length}`,
  );
  logger.warn(`Rejected Retell webhook (${req.path}): ${parts.join('; ')}`);
}

// Shared-secret guard for webhooks from systems without payload signing
// (candidate intake, Cal.com). Callers must send x-webhook-secret matching
// WEBHOOK_SHARED_SECRET. If the env var is unset, requests pass with a warning.
export function requireWebhookSecret(req: Request, res: Response, next: NextFunction): void {
  if (!env.WEBHOOK_SHARED_SECRET) {
    logger.warn('WEBHOOK_SHARED_SECRET not set — webhook accepted without authentication');
    next();
    return;
  }

  const provided = req.headers['x-webhook-secret'];
  const expected = env.WEBHOOK_SHARED_SECRET;

  const valid =
    typeof provided === 'string' &&
    provided.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

  if (!valid) {
    logger.warn(`Rejected webhook with missing/invalid x-webhook-secret (${req.path})`);
    res.status(401).json({ error: 'Invalid webhook secret' });
    return;
  }

  next();
}

// Cal.com signs webhook payloads as an HMAC-SHA256 hex digest of the raw body in
// the `x-cal-signature-256` header, using the secret configured on the webhook.
// We reuse WEBHOOK_SHARED_SECRET as that secret. A matching `x-webhook-secret`
// header is also accepted as a fallback (manual/curl testing). If the env var is
// unset, requests pass with a warning (dev-safe, matching requireWebhookSecret).
export function verifyCalSignature(req: Request, res: Response, next: NextFunction): void {
  const secret = env.WEBHOOK_SHARED_SECRET;
  if (!secret) {
    logger.warn('WEBHOOK_SHARED_SECRET not set — Cal.com webhook accepted without verification');
    next();
    return;
  }

  // Fallback: explicit shared-secret header.
  const provided = req.headers['x-webhook-secret'];
  if (
    typeof provided === 'string' &&
    provided.length === secret.length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret))
  ) {
    next();
    return;
  }

  // Primary: Cal.com HMAC-SHA256 signature over the raw request body.
  const signature = req.headers['x-cal-signature-256'];
  if (typeof signature === 'string') {
    const expected = crypto.createHmac('sha256', secret).update(rawBodyString(req)).digest('hex');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) {
      next();
      return;
    }
  }

  logger.warn(`Rejected Cal.com webhook with missing/invalid signature (${req.path})`);
  res.status(401).json({ error: 'Invalid Cal.com signature' });
}
