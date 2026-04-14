import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { supabaseAdmin } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Extract text from a resume file buffer based on its MIME type.
 */
export async function extractResumeText(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  try {
    if (mimeType === 'application/pdf') {
      const result = await pdfParse(buffer);
      return cleanText(result.text);
    }

    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      const result = await mammoth.extractRawText({ buffer });
      return cleanText(result.value);
    }

    if (mimeType === 'text/plain') {
      return cleanText(buffer.toString('utf-8'));
    }

    throw new Error(`Unsupported file type: ${mimeType}`);
  } catch (err) {
    logger.error('Resume text extraction failed:', err);
    throw err;
  }
}

/**
 * Download a resume from Supabase Storage, extract text, and update the candidate record.
 */
export async function processResume(candidateId: string, resumePath: string): Promise<string> {
  // Download file from Supabase Storage
  const { data, error } = await supabaseAdmin.storage
    .from('resumes')
    .download(resumePath);

  if (error || !data) {
    throw new Error(`Failed to download resume: ${error?.message}`);
  }

  // Determine MIME type from extension
  const ext = resumePath.split('.').pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    txt: 'text/plain',
  };

  const mimeType = mimeMap[ext || ''] || 'application/octet-stream';
  const buffer = Buffer.from(await data.arrayBuffer());
  const resumeText = await extractResumeText(buffer, mimeType);

  // Update candidate with extracted text
  await supabaseAdmin
    .from('candidates')
    .update({ resume_text: resumeText })
    .eq('id', candidateId);

  logger.info(`Processed resume for candidate ${candidateId}: ${resumeText.length} chars`);

  return resumeText;
}

/**
 * Clean extracted text - remove excessive whitespace, control chars, etc.
 */
function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .trim();
}
