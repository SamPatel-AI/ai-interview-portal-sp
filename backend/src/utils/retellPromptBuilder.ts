import { AIAgent, Application, Candidate, Job } from '../types';

interface PromptContext {
  candidate: Candidate;
  application: Application;
  job: Job;
  agent: AIAgent;
  resumptionContext?: {
    previousTranscript: string;
    questionsAsked: string[];
    answersGiven: string[];
  };
}

/**
 * Build the dynamic variables object to send to Retell AI for a call.
 * These variables get injected into the agent's prompt template.
 */
export function buildDynamicVariables(ctx: PromptContext): Record<string, string> {
  const vars: Record<string, string> = {
    candidate_name: `${ctx.candidate.first_name} ${ctx.candidate.last_name}`.trim(),
    candidate_first_name: ctx.candidate.first_name,
    candidate_email: ctx.candidate.email,
    job_title: ctx.job.title,
    job_location: [ctx.job.state, ctx.job.country].filter(Boolean).join(', '),
    company_name: '', // Will be filled by caller if available
  };

  // Add mandate questions
  if (ctx.application.mandate_questions?.length) {
    vars.mandate_questions = ctx.application.mandate_questions
      .map((q, i) => `${i + 1}. ${q}`)
      .join('\n');
  }

  // Add interview questions
  if (ctx.application.interview_questions?.length) {
    vars.interview_questions = ctx.application.interview_questions
      .map((q, i) => `${i + 1}. ${q}`)
      .join('\n');
  }

  // Add resumption context if this is a continued call
  if (ctx.resumptionContext) {
    vars.call_context = [
      'IMPORTANT: This is a resumed call. The previous call was interrupted.',
      '',
      '## Previous Conversation Summary:',
      ctx.resumptionContext.previousTranscript,
      '',
      '## Questions Already Asked:',
      ctx.resumptionContext.questionsAsked.map((q, i) => `${i + 1}. ${q}`).join('\n'),
      '',
      '## Candidate Answers So Far:',
      ctx.resumptionContext.answersGiven.map((a, i) => `${i + 1}. ${a}`).join('\n'),
      '',
      'Continue from where you left off. Do NOT repeat questions already asked.',
      'Acknowledge that you are calling back and apologize for the earlier disconnection.',
    ].join('\n');
  }

  return vars;
}

/**
 * Build the system prompt for a Retell agent based on agent config.
 * Replaces template variables like {{candidate_name}}, {{job_title}}, etc.
 */
export function buildSystemPrompt(agent: AIAgent, variables: Record<string, string>): string {
  let prompt = agent.system_prompt;

  for (const [key, value] of Object.entries(variables)) {
    prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }

  return prompt;
}
