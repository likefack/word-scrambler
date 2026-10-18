import { env } from 'cloudflare:workers';
import { contactMailConfiguration, type ContactMailEnvironment } from '../../../lib/contact-mail-auth';
import { admitPublicApi } from '../../../lib/public-api-admission';
import {
  CONTACT_HOURLY_LIMIT, CONTACT_MAX_ROWS, CONTACT_REQUEST_BYTE_LIMIT, CONTACT_RETENTION_MS,
  isContactSubmissionId, validateContactInput,
} from '../../../lib/contact-intake';

export const dynamic = 'force-dynamic';
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const BODY_TIMEOUT_MS = 10_000;
// Anonymous attempts are durably admitted before reading any request body.
const reply = (status: number, code: string, extra: Record<string, string> = {}) => Response.json({ code }, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra,
} });
class ContactRequestError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
async function readBoundedJson(request: Request): Promise<unknown> {
  const length = request.headers.get('content-length');
  if (length !== null && !/^\d+$/.test(length)) throw new ContactRequestError(400, 'CONTACT_INVALID');
  if (length !== null && Number(length) > CONTACT_REQUEST_BYTE_LIMIT) throw new ContactRequestError(413, 'CONTACT_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw new ContactRequestError(400, 'CONTACT_INVALID');
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ContactRequestError(408, 'CONTACT_TIMEOUT')), BODY_TIMEOUT_MS);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      total += value.byteLength;
      if (total > CONTACT_REQUEST_BYTE_LIMIT) throw new ContactRequestError(413, 'CONTACT_TOO_LARGE');
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    // Cancellation is producer-controlled, so never await it. Never log input.
    void reader.cancel().catch(() => {});
    if (error instanceof ContactRequestError) throw error;
    throw new ContactRequestError(400, 'CONTACT_INVALID');
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

// POST only: no public inbox/list/GET/admin/export endpoints, and no email API.
export async function POST(request: Request) {
  try {
    if (request.method !== 'POST') return reply(405, 'CONTACT_METHOD', { Allow: 'POST' });
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin) return reply(403, 'ORIGIN_MISMATCH');
    const contentType = request.headers.get('content-type') || '';
    if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i.test(contentType)) return reply(415, 'CONTACT_JSON_REQUIRED');
    const encoding = request.headers.get('content-encoding');
    if (encoding && encoding.toLowerCase() !== 'identity') return reply(415, 'CONTACT_JSON_REQUIRED');
    const admission = await admitPublicApi((env as {DB?:D1Database}).DB, 'contact');
    if (!admission.allowed) return reply(admission.status, admission.status===429?'CONTACT_RATE_LIMIT':'CONTACT_UNAVAILABLE', {'Retry-After':String(admission.retryAfter)});
    const validated = validateContactInput(await readBoundedJson(request));
    if (!validated.ok) return reply(400, validated.code);
    const environment=env as ContactMailEnvironment & {DB?:D1Database};
    const database=environment.DB;
    if (!database) return reply(503, 'CONTACT_UNAVAILABLE');
    const value = validated.value;
    const submissionId = crypto.randomUUID();
    const receivedAt = new Date(Date.now()).toISOString();
    const cutoff = new Date(Date.now() - CONTACT_RETENTION_MS).toISOString();
    const hourAgo = new Date(Date.now() - HOUR_MS).toISOString();
    // D1 batches are transactions. Fixed bound SQL preserves input as inert text.
    // Auth identity, IP, user agent, credentials and operator address are not saved.
    const mail=contactMailConfiguration(environment);
    const enqueue=mail.enabled && mail.cutoverAt!==null && receivedAt>=mail.cutoverAt;
    const statements=[
      database.prepare('DELETE FROM contact_submissions WHERE server_received_at < ?').bind(cutoff),
      database.prepare(`INSERT INTO contact_submissions
        (submission_id, reply_email, subject, body, consent_version, consented_at, reply_requested, server_received_at, status)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'pending'
        WHERE (SELECT count(*) FROM contact_submissions WHERE server_received_at >= ?) < ?`)
        .bind(submissionId, value.email || null, value.subject, value.body, value.consentVersion, receivedAt, value.replyRequested ? 1 : 0, receivedAt, hourAgo, CONTACT_HOURLY_LIMIT),
      database.prepare(`DELETE FROM contact_submissions WHERE submission_id IN (
        SELECT submission_id FROM contact_submissions ORDER BY server_received_at DESC, rowid DESC LIMIT -1 OFFSET ?
      )`).bind(CONTACT_MAX_ROWS),
      database.prepare('SELECT submission_id, server_received_at FROM contact_submissions WHERE submission_id = ? AND server_received_at >= ? LIMIT 1').bind(submissionId, cutoff),
    ];
    // Same transaction as intake. Only this new accepted ID can enter the outbox.
    if(enqueue)statements.push(database.prepare(`INSERT INTO contact_mail_outbox(submission_id)
      SELECT submission_id FROM contact_submissions WHERE submission_id=? AND server_received_at>=?`).bind(submissionId,mail.cutoverAt));
    let writeTimer: ReturnType<typeof setTimeout> | undefined;
    const results=await Promise.race([database.batch(statements),new Promise<never>((_,reject)=>{writeTimer=setTimeout(()=>reject(new Error('storage_unavailable')),3000);})]).finally(()=>clearTimeout(writeTimer));
    if (results.length !== statements.length || results.some(result => !result.success)) return reply(503, 'CONTACT_UNAVAILABLE');
    if (results[1].meta?.changes === 0) return reply(429, 'CONTACT_RATE_LIMIT', { 'Retry-After': '3600' });
    const receipt = results[3].results?.[0] as { submission_id?: unknown; server_received_at?: unknown } | undefined;
    if (!receipt || receipt.submission_id !== submissionId || !isContactSubmissionId(receipt.submission_id) || receipt.server_received_at !== receivedAt) return reply(503, 'CONTACT_UNAVAILABLE');
    return Response.json({ submissionId: receipt.submission_id, serverReceivedAt: receipt.server_received_at }, { status: 201, headers: {
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    if (error instanceof ContactRequestError) return reply(error.status, error.code);
    // Do not expose/log database errors, user text, email or authentication data.
    return reply(503, 'CONTACT_UNAVAILABLE');
  }
}
