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

  // Build candidate background summary from screening results or resume
  const screeningResult = ctx.application.ai_screening_result as Record<string, any> | null;
  if (screeningResult?.candidate_strengths?.length) {
    vars.candidate_background_summary = (screeningResult.candidate_strengths as string[])
      .slice(0, 3)
      .join('. ') + '.';
  } else if (ctx.candidate.resume_text) {
    vars.candidate_background_summary = ctx.candidate.resume_text.substring(0, 500);
  }

  // Add talking points from screening for rapport building
  if (screeningResult?.candidate_talking_points?.length) {
    vars.candidate_talking_points = (screeningResult.candidate_talking_points as string[]).join('\n');
  }

  // Interview style instructions based on agent config
  switch (ctx.agent.interview_style) {
    case 'conversational':
      vars.interview_style_instructions = 'Style: Warm and conversational. Use the candidate\'s first name 2-3 times during the interview. Use bridging phrases like "That\'s really interesting..." and "Building on what you just said...". Encourage with "Great point" or "That makes sense". Keep an encouraging, natural tone throughout.';
      break;
    case 'technical':
      vars.interview_style_instructions = 'Style: Technical deep-dive. Probe for depth — ask "Walk me through how you..." and "What was the hardest part of...". Push beyond surface-level answers. When a candidate gives a general answer, follow up with specifics. Focus on problem-solving approach and technical reasoning.';
      break;
    case 'formal':
    default:
      vars.interview_style_instructions = 'Style: Professional and structured. Maintain a clear pace with smooth transitions between topics. Use professional tone throughout. Signal transitions: "Let\'s move on to discuss..." and "Now I\'d like to explore...".';
      break;
  }

  // Add greeting/closing templates if agent has custom ones
  if (ctx.agent.greeting_template) {
    vars.greeting_template = ctx.agent.greeting_template;
  }
  if (ctx.agent.closing_template) {
    vars.closing_template = ctx.agent.closing_template;
  }

  // Add mandate questions
  if (ctx.application.mandate_questions?.length) {
    vars.mandate_questions = ctx.application.mandate_questions
      .map((q, i) => `${i + 1}. ${q}`)
      .join('\n');
  }

  // Add interview questions — topic-based format instead of numbered list
  if (ctx.application.interview_questions?.length) {
    vars.interview_questions = ctx.application.interview_questions
      .map(q => `Topic: ${q} — Explore this through natural conversation`)
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

interface InboundContext {
  candidate: { first_name: string; last_name: string; email: string };
  application?: { mandate_questions?: string[]; interview_questions?: string[] } | null;
  job?: { title?: string } | null;
  agent?: { interview_style?: string } | null;
  missedCall?: { transcript?: string } | null;
  interruptedCall?: { transcript?: string } | null;
}

/**
 * Build dynamic variables for an inbound call.
 * Centralizes the logic that was previously scattered in the webhook handler.
 * Handles: caller verification, missed-call callback acknowledgment, and interrupted call resumption.
 */
export function buildInboundContext(ctx: InboundContext): Record<string, string> {
  const vars: Record<string, string> = {
    candidate_name: `${ctx.candidate.first_name} ${ctx.candidate.last_name}`.trim(),
    candidate_first_name: ctx.candidate.first_name,
    candidate_email: ctx.candidate.email,
    job_title: ctx.job?.title || 'the position',
  };

  if (ctx.application?.mandate_questions?.length) {
    vars.mandate_questions = ctx.application.mandate_questions.join('\n');
  }
  if (ctx.application?.interview_questions?.length) {
    vars.interview_questions = ctx.application.interview_questions.join('\n');
  }

  // Build call context based on scenario
  const contextParts: string[] = [];

  // Caller verification — always include for inbound
  contextParts.push(
    `This is an inbound call. The caller dialed in — verify their identity:`,
    `"Just to verify, am I speaking with ${ctx.candidate.first_name}?"`,
    '',
  );

  if (ctx.missedCall) {
    // Candidate is calling back after we couldn't reach them
    contextParts.push(
      `CONTEXT: We tried calling this candidate earlier for their ${vars.job_title} interview but couldn't reach them. They are now calling back.`,
      `Acknowledge this naturally: "I believe we tried reaching you earlier for your ${vars.job_title} interview — shall we go ahead now?"`,
      '',
    );
  }

  if (ctx.interruptedCall) {
    // Resuming a previously interrupted call
    contextParts.push(
      'IMPORTANT: This candidate is calling back after a previous call was interrupted.',
      'Previous conversation:',
      ctx.interruptedCall.transcript || 'No transcript available',
      '',
      'Continue from where you left off. Acknowledge the reconnection:',
      '"Welcome back! Sorry about the earlier disconnection. Let me pick up where we left off."',
      'Do NOT repeat questions already asked in the previous conversation.',
      '',
    );
  }

  if (contextParts.length > 0) {
    vars.call_context = contextParts.join('\n');
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
