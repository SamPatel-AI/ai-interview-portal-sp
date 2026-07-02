import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  RETELL_API_KEY: z.string().default(''),
  RETELL_FROM_NUMBER: z.string().default('+10000000000'),

  // Shared secret required (when set) on candidate-intake and cal-booking webhooks
  WEBHOOK_SHARED_SECRET: z.string().optional(),

  // Cal.com API (cancel bookings for the deadline backstop; drive per-job availability)
  CAL_API_KEY: z.string().optional(),
  // The Cal.com event type that candidates book (numeric id), used to cap the
  // booking window to a job's interview deadline.
  CAL_EVENT_TYPE_ID: z.string().optional(),
  // Public booking link used in invitation emails. Defaults to the Saanvi screen-interview link.
  CAL_BASE_URL: z.string().default('https://cal.com/saanvitech/screen-interview-x-saanvi-tech'),
  // Cal.com API version header (date-stamped). Bookings endpoints use 2024-08-13.
  CAL_API_VERSION: z.string().default('2024-08-13'),

  CEIPAL_API_KEY: z.string().default(''),
  CEIPAL_EMAIL: z.string().default(''),
  CEIPAL_PASSWORD: z.string().default(''),
  // Graph mail intake: how often to poll the AISaanviHR inbox for CEIPAL
  // notification emails (minutes) and how far back each poll looks (days —
  // generous on purpose; the ceipal_submissions ledger dedupes).
  CEIPAL_MAIL_POLL_MINUTES: z.string().default('5'),
  CEIPAL_MAIL_LOOKBACK_DAYS: z.string().default('3'),
  // Encoded CEIPAL user id whose assigned jobs are in-scope for email intake
  // (Sam Patel / AISaanviHR@saanvi.us — resolved once via getUsersList).
  CEIPAL_RECRUITER_ID: z.string().default('z5G7h3l6a1kMvyS65NP3c9XXNG0FW3dPbRUaKR83guY='),

  // Default org for server-side (non-authenticated) flows — single CEIPAL
  // account maps to one org. Used by the CEIPAL submissions poller.
  DEFAULT_ORG_ID: z.string().default(''),

  OPENROUTER_API_KEY: z.string().default(''),
  OPENROUTER_MODEL: z.string().default('openai/gpt-4o-mini'),

  MS_GRAPH_CLIENT_ID: z.string().optional(),
  MS_GRAPH_CLIENT_SECRET: z.string().optional(),
  MS_GRAPH_TENANT_ID: z.string().optional(),
  // Mailbox (UPN) that Graph sends from, e.g. AISaanviHR@saanvi.us
  MS_GRAPH_SENDER: z.string().optional(),

  // Email transport: 'graph' (Microsoft Graph API), 'smtp' (SMTP), 'log' (dev log-only)
  EMAIL_TRANSPORT: z.enum(['graph', 'smtp', 'log']).default('log'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  FRONTEND_URL: z.string().default('http://localhost:8082'),
  PUBLIC_API_URL: z.string().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
