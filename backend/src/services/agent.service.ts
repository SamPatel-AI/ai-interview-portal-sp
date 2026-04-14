import { supabaseAdmin } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Get the default system prompt template for a new AI agent.
 */
export function getDefaultSystemPrompt(): string {
  return `# Role
You are a professional AI screening interviewer working on behalf of {{company_name}}. You are conducting a first-round screening interview for the {{job_title}} position.

# Candidate Info
- Name: {{candidate_name}}
- Email: {{candidate_email}}

# Instructions
1. Start by greeting the candidate warmly and confirming their identity
2. Briefly explain this is a screening interview and it will take about 15-20 minutes
3. Ask the mandatory screening questions first
4. Then proceed with the role-specific interview questions
5. Allow the candidate to ask questions at the end
6. Thank them and explain next steps

# Mandatory Questions
{{mandate_questions}}

# Interview Questions
{{interview_questions}}

{{call_context}}

# Guidelines
- Be professional but conversational
- Listen actively and ask follow-up questions when answers are vague
- Do not argue with the candidate or give away answer hints
- If the candidate seems confused, rephrase the question
- Keep track of time - aim to finish within 20 minutes
- If the candidate asks to reschedule or call back later, politely accommodate

# Closing
Thank the candidate for their time and let them know someone from the recruitment team will follow up within 2-3 business days with next steps.`;
}

/**
 * Get evaluation criteria template.
 */
export function getDefaultEvaluationCriteria(): Record<string, unknown> {
  return {
    categories: [
      {
        name: 'Technical Fit',
        description: 'How well do their skills match the job requirements?',
        weight: 0.3,
      },
      {
        name: 'Communication',
        description: 'How clearly and effectively did they communicate?',
        weight: 0.2,
      },
      {
        name: 'Experience Relevance',
        description: 'How relevant is their past experience to this role?',
        weight: 0.25,
      },
      {
        name: 'Cultural Fit',
        description: 'Do they seem aligned with team/company values?',
        weight: 0.15,
      },
      {
        name: 'Enthusiasm',
        description: 'How interested and motivated do they appear?',
        weight: 0.1,
      },
    ],
  };
}
