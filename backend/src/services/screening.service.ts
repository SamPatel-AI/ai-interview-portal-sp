import { env } from '../config/env';
import { logger } from '../utils/logger';

interface ScreeningInput {
  resumeText: string;
  jobTitle: string;
  jobDescription: string;
  skills: string[];
  state: string | null;
  country: string | null;
  taxTerms: string | null;
}

interface ScreeningResult {
  candidate_strengths: string[];
  candidate_weaknesses: string[];
  risk_factor: { score: string; explanation: string };
  reward_factor: { score: string; explanation: string };
  overall_fit_rating: number;
  justification_for_rating: string;
  mandate_questions: string[];
  interview_questions: string[];
}

/**
 * Screen a candidate's resume against a job description using AI.
 * Returns structured analysis + generated interview questions.
 */
export async function screenResume(input: ScreeningInput): Promise<ScreeningResult> {
  const systemPrompt = `You are an expert technical recruiter. Analyze the candidate resume against the job description and return a JSON object with these exact keys:
- candidate_strengths: string[] (top strengths matching job)
- candidate_weaknesses: string[] (gaps or mismatches)
- risk_factor: { score: "Low"|"Medium"|"High", explanation: string }
- reward_factor: { score: "Low"|"Medium"|"High", explanation: string }
- overall_fit_rating: number (0-10, integer)
- justification_for_rating: string
- mandate_questions: string[] (2 mandatory questions: visa status + location availability)
- interview_questions: string[] (10 role-specific screening questions)

Job Description:
Title: ${input.jobTitle}
Description: ${input.jobDescription}
Skills: ${input.skills.join(', ')}
Location: ${[input.state, input.country].filter(Boolean).join(', ')}
Tax Terms: ${input.taxTerms || 'N/A'}

Return ONLY valid JSON, no markdown.`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Candidate Resume:\n${input.resumeText}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    logger.error('OpenRouter API error:', errText);
    throw new Error(`AI screening failed: ${response.status}`);
  }

  const result = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = result.choices[0]?.message?.content;
  if (!content) throw new Error('AI returned empty response');

  const parsed = JSON.parse(content) as ScreeningResult;

  // Ensure mandate questions always include the standard ones
  const location = [input.state, input.country].filter(Boolean).join(', ');
  const standardMandate = [
    'What is your current work authorization or visa status?',
    `This role is based in ${location}. Are you currently located here, and if not, are you open to relocation or hybrid/on-site work?`,
  ];

  parsed.mandate_questions = standardMandate;

  return parsed;
}
