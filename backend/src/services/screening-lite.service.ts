import { env } from '../config/env';
import { logger } from '../utils/logger';

interface LiteScreeningResult {
  fit_score: number;
  justification: string;
}

/**
 * Lightweight resume scoring for re-engagement pipeline.
 * Uses ~500 tokens per call vs ~2000 for full screenResume().
 * Cost: ~$0.01 per 100 candidates.
 */
export async function screenResumeLite(
  resumeText: string,
  jobTitle: string,
  skills: string[]
): Promise<LiteScreeningResult> {
  const prompt = `Rate this candidate's fit for the "${jobTitle}" role (skills: ${skills.join(', ')}).
Return JSON only: {"fit_score": number (0-10), "justification": string (1 sentence)}`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: resumeText.substring(0, 2000) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 150,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    logger.error('Lite screening API error:', errText);
    throw new Error(`Lite screening failed: ${response.status}`);
  }

  const result = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = result.choices[0]?.message?.content;
  if (!content) throw new Error('AI returned empty response for lite screening');

  const parsed = JSON.parse(content) as LiteScreeningResult;

  return {
    fit_score: Math.min(10, Math.max(0, Math.round(parsed.fit_score))),
    justification: parsed.justification || '',
  };
}

/**
 * Batch screen multiple resumes with rate limiting.
 * Processes in batches of 10 with 2s delay between batches.
 */
export async function batchScreenResumesLite(
  candidates: Array<{ id: string; resume_text: string }>,
  jobTitle: string,
  skills: string[]
): Promise<Array<{ candidateId: string; fit_score: number; justification: string }>> {
  const results: Array<{ candidateId: string; fit_score: number; justification: string }> = [];
  const batchSize = 10;

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);

    const batchResults = await Promise.allSettled(
      batch.map(async (c) => {
        const result = await screenResumeLite(c.resume_text, jobTitle, skills);
        return { candidateId: c.id, ...result };
      })
    );

    for (const r of batchResults) {
      if (r.status === 'fulfilled') {
        results.push(r.value);
      } else {
        logger.error('Lite screening failed for candidate in batch:', r.reason);
      }
    }

    // Rate limit: wait 2s between batches
    if (i + batchSize < candidates.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return results;
}
