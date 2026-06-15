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
    logger.warn(`Rejected Retell webhook with invalid signature (${req.path})`);
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  next();
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
