import { env } from 'cloudflare:workers';
import { admitPublicApi } from '../../../lib/public-api-admission';
import {
  AUTOMATIC_TEXT_MAX_ROWS as ISSUE_MAX_ROWS, AUTOMATIC_TEXT_BODY_LIMIT as ISSUE_BODY_LIMIT, AUTOMATIC_TEXT_RETENTION_MS as ISSUE_RETENTION_MS, validateAutomaticTextDiagnostic,
} from '../../../lib/automatic-text-diagnostics';
import { isConversionId } from '../../../lib/conversion-diagnostics';

export const dynamic = 'force-dynamic';
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const BODY_TIMEOUT_MS = 10_000;
// Anonymous attempts are durably admitted before reading any request body.
const reply = (status: number, code: string, extra: Record<string, string> = {}) => Response.json({ code }, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra,
} });
class IssueRequestError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
async function readBoundedJson(request: Request): Promise<unknown> {
  const length = request.headers.get('content-length');
  if (length !== null && !/^\d+$/.test(length)) throw new IssueRequestError(400, 'ISSUE_INVALID');
  if (length !== null && Number(length) > ISSUE_BODY_LIMIT) throw new IssueRequestError(413, 'ISSUE_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw new IssueRequestError(400, 'ISSUE_INVALID');
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new IssueRequestError(408, 'ISSUE_TIMEOUT')), BODY_TIMEOUT_MS);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      total += value.byteLength;
      if (total > ISSUE_BODY_LIMIT) throw new IssueRequestError(413, 'ISSUE_TOO_LARGE');
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    // Cancellation is producer-controlled, so never await it. Never log input.
    void reader.cancel().catch(() => {});
    if (error instanceof IssueRequestError) throw error;
    throw new IssueRequestError(400, 'ISSUE_INVALID');
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

// Fixed successful-conversion text intake. No GET, mail, connector or provider call.
export async function POST(request: Request) {
  try {
    if(request.signal.aborted)return reply(408,'TEXT_CANCELLED');
    if (request.method !== 'POST') return reply(405, 'ISSUE_METHOD', { Allow: 'POST' });
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin) return reply(403, 'ORIGIN_MISMATCH');
    const contentType = request.headers.get('content-type') || '';
    if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i.test(contentType)) return reply(415, 'ISSUE_JSON_REQUIRED');
    const encoding = request.headers.get('content-encoding');
    if (encoding && encoding.toLowerCase() !== 'identity') return reply(415, 'ISSUE_JSON_REQUIRED');
    const admission = await admitPublicApi((env as {DB?:D1Database}).DB, 'issue_reports');
    if (!admission.allowed) return reply(admission.status, admission.status===429?'ISSUE_RATE_LIMIT':'ISSUE_UNAVAILABLE', {'Retry-After':String(admission.retryAfter)});
    const validated = validateAutomaticTextDiagnostic(await readBoundedJson(request));
    if (!validated.ok) return reply(400, validated.code);
    const database = (env as { DB?: D1Database }).DB;
    if (!database) return reply(503, 'ISSUE_UNAVAILABLE');
    const value = validated.value;
    const reportId = value.reportId;
    const table = 'automatic_diagnostic_text_reports';
    if(request.signal.aborted)return reply(408,'TEXT_CANCELLED');
    const receivedAt = new Date(Date.now()).toISOString();
    const cutoff = new Date(Date.now() - ISSUE_RETENTION_MS).toISOString();
    const hourAgo = new Date(Date.now() - HOUR_MS).toISOString();
    // D1 batches are transactions. Fixed bound SQL preserves input as inert text.
    // Auth identity, IP, user agent, credentials and operator address are not saved.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const operation = database.batch([
        database.prepare(`DELETE FROM ${table} WHERE server_received_at < ?`).bind(cutoff),
        database.prepare(`INSERT INTO ${table}
          (report_id, conversion_id, app_version, mode, language, original_text, rewritten_text, selection_on_at_execution, notice_version, server_received_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE (SELECT count(*) FROM ${table} WHERE server_received_at >= ?) < 100
          ON CONFLICT(report_id) DO NOTHING`)
          .bind(reportId, value.conversionId, value.version, value.mode, value.language, value.original, value.rewritten,
            1, value.noticeVersion, receivedAt, hourAgo),
        database.prepare(`DELETE FROM ${table} WHERE report_id IN (
          SELECT report_id FROM ${table} ORDER BY server_received_at DESC, rowid DESC LIMIT -1 OFFSET ?
        )`).bind(ISSUE_MAX_ROWS),
        database.prepare(`SELECT report_id FROM ${table} WHERE report_id = ? AND server_received_at >= ? LIMIT 1`).bind(reportId, cutoff),
      ]);
      const results = await Promise.race([operation, new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('unavailable')),3000);})]);
      if (results.length !== 4 || results.some(result => !result.success)) return reply(503, 'ISSUE_UNAVAILABLE');
      const receipt = results[3].results?.[0] as {report_id?:unknown}|undefined;
      if (!receipt || receipt.report_id !== reportId || !isConversionId(receipt.report_id)) return reply(429, 'ISSUE_RATE_LIMIT', {'Retry-After':'3600'});
      return Response.json({reportId:receipt.report_id}, {status:201,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    } finally { clearTimeout(timer); }

  } catch (error) {
    if (error instanceof IssueRequestError) return reply(error.status, error.code);
    // Do not expose/log database errors, user text, email or authentication data.
    return reply(503, 'ISSUE_UNAVAILABLE');
  }
}
