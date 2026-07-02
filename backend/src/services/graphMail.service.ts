import { env } from '../config/env';
import { logger } from '../utils/logger';
import { getGraphToken } from './email.service';

/**
 * Microsoft Graph Mail.Read helpers for the CEIPAL email intake.
 *
 * Reads the shared AISaanviHR mailbox (MS_GRAPH_SENDER) with the same app-only
 * token the email sender uses. CEIPAL notification emails are the only current
 * source that carries candidate + JPC job code + résumé together (the CEIPAL
 * API exposes none of these on its submission endpoints), so the intake poller
 * lists them here, and moves handled messages to a "Processed" folder so the
 * inbox stays a clean work queue.
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

/** Sender address of CEIPAL "Pipeline Submission" notification emails. */
export const CEIPAL_NOTIFICATION_SENDER = 'notifications@ceipalmail.com';

export interface GraphMailMessage {
  id: string;
  subject: string;
  receivedDateTime: string;
  /** Globally unique RFC id — the dedupe key in the ceipal_submissions ledger. */
  internetMessageId: string;
  hasAttachments: boolean;
}

export interface GraphMailAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
  /** Base64 file bytes; present on fileAttachment for normal-sized files. */
  contentBytes?: string;
}

function mailboxBase(): string {
  const mailbox = env.MS_GRAPH_SENDER;
  if (!mailbox) throw new Error('MS_GRAPH_SENDER (mailbox) is not configured');
  return `${GRAPH_BASE}/users/${encodeURIComponent(mailbox)}`;
}

async function graphRequest(
  url: string,
  init: { method?: string; body?: unknown; preferTextBody?: boolean } = {},
): Promise<Response> {
  const token = await getGraphToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  // Have Graph render HTML bodies down to plain text server-side.
  if (init.preferTextBody) headers.Prefer = 'outlook.body-content-type="text"';
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';

  const resp = await fetch(url, {
    method: init.method || 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!resp.ok) {
    const detail = (await resp.text()).slice(0, 300);
    throw new Error(`Graph ${init.method || 'GET'} ${url.split('?')[0]} failed (${resp.status}): ${detail}`);
  }
  return resp;
}

async function graphGetJson<T>(url: string, preferTextBody = false): Promise<T> {
  const resp = await graphRequest(url, { preferTextBody });
  return (await resp.json()) as T;
}

/**
 * List inbox messages from the CEIPAL notification sender received on/after
 * `sinceIso`, oldest first. Follows @odata.nextLink with a runaway page cap;
 * the caller dedupes against the ledger, so a generous window is safe.
 */
export async function listCeipalInboxMessages(sinceIso: string): Promise<GraphMailMessage[]> {
  const filter = encodeURIComponent(
    `from/emailAddress/address eq '${CEIPAL_NOTIFICATION_SENDER}' and receivedDateTime ge ${sinceIso}`,
  );
  const select = 'id,subject,receivedDateTime,internetMessageId,hasAttachments';
  let url: string | null =
    `${mailboxBase()}/mailFolders/inbox/messages?$filter=${filter}&$select=${select}&$top=50`;

  const all: GraphMailMessage[] = [];
  let pages = 0;
  while (url && pages < 20) {
    const data: { value?: GraphMailMessage[]; '@odata.nextLink'?: string } = await graphGetJson(url);
    all.push(...(data.value || []));
    url = data['@odata.nextLink'] || null;
    pages += 1;
  }

  // Graph rejects $orderby combined with this $filter — sort client-side.
  all.sort((a, b) => a.receivedDateTime.localeCompare(b.receivedDateTime));
  return all;
}

/**
 * Fetch a message body as plain text (Graph converts HTML server-side via the
 * Prefer header; the parser also html-strips as a fallback).
 */
export async function getMessageBodyText(messageId: string): Promise<{ content: string; contentType: string }> {
  const data = await graphGetJson<{ body?: { content?: string; contentType?: string } }>(
    `${mailboxBase()}/messages/${encodeURIComponent(messageId)}?$select=body`,
    true,
  );
  return { content: data.body?.content || '', contentType: data.body?.contentType || 'text' };
}

/**
 * Fetch a message's file attachments with bytes. Falls back to the raw
 * `/$value` stream when Graph omits contentBytes (large files).
 */
export async function getMessageAttachments(messageId: string): Promise<GraphMailAttachment[]> {
  const base = `${mailboxBase()}/messages/${encodeURIComponent(messageId)}/attachments`;
  const data = await graphGetJson<{ value?: Array<GraphMailAttachment & { '@odata.type'?: string }> }>(base);

  const files = (data.value || []).filter((a) => (a['@odata.type'] || '').endsWith('fileAttachment'));
  for (const att of files) {
    if (att.contentBytes) continue;
    try {
      const resp = await graphRequest(`${base}/${encodeURIComponent(att.id)}/$value`);
      att.contentBytes = Buffer.from(await resp.arrayBuffer()).toString('base64');
    } catch (err) {
      logger.warn(`graphMail: attachment bytes fetch failed for "${att.name}": ${(err as Error).message}`);
    }
  }
  return files;
}

// Cached id of the "Processed" folder (created on first use).
let processedFolderId: string | null = null;

async function getProcessedFolderId(): Promise<string> {
  if (processedFolderId) return processedFolderId;

  const filter = encodeURIComponent("displayName eq 'Processed'");
  const found = await graphGetJson<{ value?: Array<{ id: string }> }>(
    `${mailboxBase()}/mailFolders?$filter=${filter}&$select=id`,
  );
  if (found.value?.length) {
    processedFolderId = found.value[0].id;
    return processedFolderId;
  }

  const created = await graphRequest(`${mailboxBase()}/mailFolders`, {
    method: 'POST',
    body: { displayName: 'Processed' },
  });
  processedFolderId = ((await created.json()) as { id: string }).id;
  logger.info('graphMail: created "Processed" mail folder');
  return processedFolderId;
}

/**
 * Move a handled message out of the inbox into the "Processed" folder. The
 * ledger is the real idempotency guard — this just keeps the inbox clean.
 */
export async function moveMessageToProcessed(messageId: string): Promise<void> {
  const destinationId = await getProcessedFolderId();
  await graphRequest(`${mailboxBase()}/messages/${encodeURIComponent(messageId)}/move`, {
    method: 'POST',
    body: { destinationId },
  });
}
