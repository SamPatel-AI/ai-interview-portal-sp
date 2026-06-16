import { z } from 'zod';

const phaseSchema = z.object({ enabled: z.boolean(), guidance: z.string().default('') });

export const builderConfigSchema = z.object({
  interviewer_persona: z.string().default(''),
  company_blurb: z.string().default(''),
  tone: z.enum(['formal', 'conversational', 'technical']).default('conversational'),
  phases: z.object({
    rapport: phaseSchema,
    screening: phaseSchema,
    deep_dive: phaseSchema,
    candidate_qa: phaseSchema,
    closing: phaseSchema,
  }),
  dos: z.array(z.string()).default([]),
  donts: z.array(z.string()).default([]),
  greeting: z.string().default(''),
  closing: z.string().default(''),
});

export const agentBodySchema = z.object({
  name: z.string().min(1),
  client_company_id: z.string().uuid().optional(),
  voice_id: z.string().min(1),
  language: z.string().default('en-US'),
  interview_style: z.enum(['formal', 'conversational', 'technical']).default('conversational'),
  max_call_duration_sec: z.number().int().min(60).max(3600).default(1200),
  evaluation_criteria: z.record(z.unknown()).optional(),
  greeting_template: z.string().optional(),
  closing_template: z.string().optional(),
  is_active: z.boolean().optional(),
  builder_config: builderConfigSchema.optional(),
  system_prompt: z.string().min(10).optional(),
}).refine(
  (b) => !!b.builder_config || (!!b.system_prompt && b.system_prompt.length >= 10),
  { message: 'Provide either builder_config (guided) or system_prompt (legacy).' },
);

export const updateAgentBodySchema = agentBodySchema;
