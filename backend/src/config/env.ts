import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  RETELL_API_KEY: z.string().default(''),
  RETELL_WEBHOOK_SECRET: z.string().optional(),
  RETELL_FROM_NUMBER: z.string().default('+10000000000'),

  CEIPAL_API_KEY: z.string().default(''),
  CEIPAL_EMAIL: z.string().default(''),
  CEIPAL_PASSWORD: z.string().default(''),

  OPENROUTER_API_KEY: z.string().default(''),
  OPENROUTER_MODEL: z.string().default('openai/gpt-4o-mini'),

  MS_GRAPH_CLIENT_ID: z.string().optional(),
  MS_GRAPH_CLIENT_SECRET: z.string().optional(),
  MS_GRAPH_TENANT_ID: z.string().optional(),
  MS_GRAPH_REDIRECT_URI: z.string().optional(),

  FRONTEND_URL: z.string().default('http://localhost:8082'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
