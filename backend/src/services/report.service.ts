import { logger } from '../utils/logger';

interface CandidateReportData {
  candidate: { name: string; email: string };
  applications: Array<{
    job_title: string;
    company: string;
    ai_score: number | null;
    screening_result: Record<string, unknown> | null;
  }>;
  interviews: Array<{
    duration_minutes: number;
    analysis: Record<string, unknown> | null;
    evaluations: Array<{ decision: string; rating: number; notes: string }>;
  }>;
}

/**
 * Generate an AI executive summary for a candidate report.
 * Uses OpenRouter API (same as screening).
 */
export async function generateCandidateReport(data: CandidateReportData): Promise<string> {
  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_KEY) {
    logger.warn('OpenRouter API key not configured — skipping AI report generation');
    return '';
  }

  const prompt = `Generate a concise executive summary report for this candidate to share with a hiring client.

Candidate: ${data.candidate.name}

Applications:
${data.applications.map(a => `- ${a.job_title} at ${a.company || 'N/A'}: AI Score ${a.ai_score ?? 'N/A'}/10
  Strengths: ${(a.screening_result as any)?.strengths?.join(', ') || 'N/A'}
  Weaknesses: ${(a.screening_result as any)?.weaknesses?.join(', ') || 'N/A'}`).join('\n')}

Interviews Completed: ${data.interviews.length}
${data.interviews.map((i, idx) => `- Interview ${idx + 1}: ${i.duration_minutes} min, Rating: ${i.evaluations?.[0]?.rating || 'N/A'}/5, Decision: ${i.evaluations?.[0]?.decision || 'Pending'}`).join('\n')}

Format the report with these sections:
1. Candidate Overview (2-3 sentences)
2. Screening Summary (key strengths and concerns)
3. Interview Performance (if applicable)
4. Recommendation (advance/hold/reject with reasoning)

Keep it under 300 words. Be professional and objective.`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_KEY}`,
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
      }),
    });

    const result = await response.json() as any;
    return result.choices?.[0]?.message?.content || '';
  } catch (err) {
    logger.error('Failed to generate AI report:', err);
    return '';
  }
}
