import { AIAgent, Application, Candidate, Job, BuilderConfig } from '../types';

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
    candidate_background_summary: '',
    candidate_talking_points: '',
    mandate_questions: '',
    interview_questions: '',
    call_context: '',
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

/**
 * Compile a guided-builder config into a full system-prompt template.
 * This OWNS inserting the {{dynamic_variables}} that the call layer fills
 * per application — recruiters never type them. Disabled phases are omitted.
 */
export function compileSystemPrompt(config: BuilderConfig): string {
  const toneLine: Record<string, string> = {
    conversational: 'Keep a warm, conversational tone. Use the candidate\'s first name naturally.',
    technical: 'Take a technical deep-dive tone. Probe for depth and push past surface answers.',
    formal: 'Keep a professional, structured tone with clear transitions between topics.',
  };

  const parts: string[] = [];

  parts.push(
    `# Role`,
    `You are ${config.interviewer_persona || 'a professional AI screening interviewer'} working on behalf of {{company_name}}.`,
    `You are conducting a first-round screening interview for the {{job_title}} position.`,
    '',
    toneLine[config.tone] ?? toneLine.formal,
    '',
    config.company_blurb ? `About the company: ${config.company_blurb}` : `About the company: {{company_name}}.`,
    '',
    `# Candidate Info`,
    `- Name: {{candidate_name}}`,
    `- Email: {{candidate_email}}`,
    `- Background: {{candidate_background_summary}}`,
    '',
    `IMPORTANT: Do NOT read questions from a list. Weave interview topics into natural conversation. If a topic is already answered, do not re-ask it. When an answer is vague, ask a follow-up before moving on.`,
    '---',
  );

  if (config.phases.rapport.enabled) {
    parts.push(
      `## Phase — Rapport`,
      config.greeting ? config.greeting : `Greet the candidate by first name, introduce yourself and the purpose of the call.`,
      `Use these talking points to build rapport: {{candidate_talking_points}}`,
      config.phases.rapport.guidance,
      '',
    );
  }
  if (config.phases.screening.enabled) {
    parts.push(
      `## Phase — Mandatory Screening`,
      `Transition naturally, then confirm: {{mandate_questions}}`,
      `Keep these brief and conversational — not a checklist.`,
      config.phases.screening.guidance,
      '',
    );
  }
  if (config.phases.deep_dive.enabled) {
    parts.push(
      `## Phase — Deep-dive`,
      `Explore 5-7 of these topics based on the conversation flow: {{interview_questions}}`,
      `Ask follow-ups when answers are vague. Skip topics already covered.`,
      config.phases.deep_dive.guidance,
      '',
    );
  }
  if (config.phases.candidate_qa.enabled) {
    parts.push(
      `## Phase — Candidate Questions`,
      `Ask: "Before we wrap up, do you have any questions about the role or {{company_name}}?" Answer what you can; defer specifics to the recruiter.`,
      config.phases.candidate_qa.guidance,
      '',
    );
  }
  if (config.phases.closing.enabled) {
    parts.push(
      `## Phase — Closing`,
      config.closing ? config.closing : `Thank the candidate and let them know the recruitment team will follow up within 2-3 business days.`,
      config.phases.closing.guidance,
      '',
    );
  }

  parts.push('---', '{{call_context}}', '');

  if (config.dos.length > 0 || config.donts.length > 0) {
    parts.push(`# Guidelines`);
    for (const d of config.dos) parts.push(`- ${d}`);
    for (const d of config.donts) parts.push(`- ${d}`);
  }

  // Drop empty lines produced by blank guidance fields, but keep intentional spacing.
  return parts.filter((p, i) => !(p === '' && parts[i - 1] === '')).join('\n');
}

interface SampleContext {
  jobTitle?: string;
  companyName?: string;
}

/**
 * Build realistic sample dynamic variables for a TEST call, so a recruiter
 * can hear the agent before using it on real candidates. Covers every key
 * compileSystemPrompt / the default prompt reference.
 */
export function buildSampleVariables(ctx: SampleContext): Record<string, string> {
  return {
    candidate_name: 'Alex Sample',
    candidate_first_name: 'Alex',
    candidate_email: 'alex.sample@example.com',
    candidate_background_summary: 'Five years of relevant experience with strong communication skills.',
    candidate_talking_points: 'Recently led a cross-functional project. Background in the target industry.',
    job_title: ctx.jobTitle || 'the position',
    company_name: ctx.companyName || 'our company',
    job_location: 'Remote',
    interview_style_instructions: 'Style: Warm and conversational.',
    mandate_questions: '1. Are you authorized to work in the country?\n2. What are your salary expectations?',
    interview_questions: 'Topic: Recent project experience — Explore through natural conversation\nTopic: Problem-solving approach — Explore through natural conversation',
    call_context: 'This is a TEST call to preview the agent. Treat the caller as a sample candidate.',
  };
}
