import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import {
  ERROR_REPORT_BODY_LIMIT, ERROR_REPORT_MAX_ROWS, ERROR_REPORT_RETENTION_MS,
  isErrorReportId, validateErrorReportDiagnostic,
} from '../../../lib/error-reports';

export const dynamic = 'force-dynamic';

// Authentication required; identities are checked, never stored or used as log fields.
// These small per-instance guards are best effort, NOT a global account quota.
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const BODY_TIMEOUT_MS = 10_000;
let active = false;
let attempts: number[] = [];

const reply = (status: number, code: string, extra: Record<string, string> = {}) =>
  Response.json({ code }, { status, headers: {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra,
  } });

class ReportRequestError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const length = request.headers.get('content-length');
  if (length !== null && !/^\d+$/.test(length)) throw new ReportRequestError(400, 'REPORT_INVALID');
  if (length !== null && Number(length) > ERROR_REPORT_BODY_LIMIT) throw new ReportRequestError(413, 'REPORT_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw new ReportRequestError(400, 'REPORT_INVALID');
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ReportRequestError(408, 'REPORT_TIMEOUT')), BODY_TIMEOUT_MS);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      total += value.byteLength;
      if (total > ERROR_REPORT_BODY_LIMIT) throw new ReportRequestError(413, 'REPORT_TOO_LARGE');
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    // Do not await a producer-controlled cancellation promise.
    void reader.cancel().catch(() => {});
    if (error instanceof ReportRequestError) throw error;
    throw new ReportRequestError(400, 'REPORT_INVALID');
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

// POST only. There is deliberately no report-listing, GET, admin, or dump route.
export async function POST(request: Request) {
  let reserved = false;
  try {
    if (request.method !== 'POST') return reply(405, 'REPORT_METHOD', { Allow: 'POST' });
    const user = await getChatGPTUser();
    if (!user || typeof user.userId !== 'string' || !user.userId) return reply(401, 'AUTH_REQUIRED');
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin) return reply(403, 'ORIGIN_MISMATCH');
    const contentType = request.headers.get('content-type') || '';
    if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i.test(contentType)) return reply(415, 'REPORT_JSON_REQUIRED');
    const encoding = request.headers.get('content-encoding');
    if (encoding && encoding.toLowerCase() !== 'identity') return reply(415, 'REPORT_JSON_REQUIRED');

    const reportIdHeader = request.headers.get('x-report-id');
    if (!isErrorReportId(reportIdHeader)) return reply(400, 'REPORT_INVALID');
    const reportId = reportIdHeader.toLowerCase();
    const now = Date.now();
    attempts = attempts.filter(at => now - at < HOUR_MS);
    if (active) return reply(429, 'REPORT_BUSY', { 'Retry-After': '1' });
    const recent = attempts.filter(at => now - at < MINUTE_MS);
    const waitUntil = Math.max(
      recent.length >= 10 ? recent[0] + MINUTE_MS : 0,
      attempts.length >= 100 ? attempts[0] + HOUR_MS : 0,
    );
    if (waitUntil > now) return reply(429, 'REPORT_RATE_LIMIT', { 'Retry-After': String(Math.ceil((waitUntil - now) / 1_000)) });
    active = true; reserved = true; attempts.push(now);

    const diagnostic = validateErrorReportDiagnostic(await readBoundedJson(request), now);
    if (!diagnostic) return reply(400, 'REPORT_INVALID');
    const database = (env as { DB?: D1Database }).DB;
    if (!database) return reply(503, 'REPORT_UNAVAILABLE');
    const receivedAt = new Date(now).toISOString();
    const cutoff = new Date(now - ERROR_REPORT_RETENTION_MS).toISOString();

    // D1 batch is transactional: retain bounded records, deduplicate retries, and
    // return the originally stored receipt. Every value uses a bound parameter.
    // Only migration-owned tables are used; no request-time DDL or raw JSON blobs.
    const results = await database.batch([
      database.prepare('DELETE FROM error_reports WHERE server_received_at < ?').bind(cutoff),
      database.prepare(`INSERT INTO error_reports
        (report_id, request_id, code, stage, http_status, upstream_status, version, timestamp, server_received_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`)
        .bind(reportId, diagnostic.requestId, diagnostic.code, diagnostic.stage,
          diagnostic.httpStatus, diagnostic.upstreamStatus ?? null, diagnostic.version, diagnostic.timestamp, receivedAt),
      database.prepare(`DELETE FROM error_reports WHERE report_id IN (
        SELECT report_id FROM error_reports ORDER BY server_received_at DESC, rowid DESC LIMIT -1 OFFSET ?
      )`).bind(ERROR_REPORT_MAX_ROWS),
      database.prepare("SELECT report_id, server_received_at FROM error_reports WHERE report_id = ? OR (request_id = ? AND request_id <> 'unavailable') LIMIT 1")
        .bind(reportId, diagnostic.requestId),
    ]);
    if (results.length !== 4 || results.some(result => !result.success)) return reply(503, 'REPORT_UNAVAILABLE');
    const receipt = results[3].results?.[0] as { report_id?: unknown; server_received_at?: unknown } | undefined;
    if (!receipt || !isErrorReportId(receipt.report_id) ||
        typeof receipt.server_received_at !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(receipt.server_received_at)) return reply(503, 'REPORT_UNAVAILABLE');
    return Response.json({ reportId: receipt.report_id, serverReceivedAt: receipt.server_received_at }, {
      status: 200, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (error) {
    if (error instanceof ReportRequestError) return reply(error.status, error.code);
    // Neither raw exceptions nor database/provider details reach the browser/logs.
    return reply(503, 'REPORT_UNAVAILABLE');
  } finally {
    if (reserved) active = false;
  }
}
