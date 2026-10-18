import 'server-only';

/** Global anonymous budgets. Never accept limits, category, time or IDs from clients. */
export const PUBLIC_API_LIMITS = Object.freeze({
  rewrite: Object.freeze({ minute: 5, hour: 60, active: 2 }),
  contact: Object.freeze({ minute: 3, hour: 30, active: 0 }),
  diagnostics: Object.freeze({ minute: 30, hour: 300, active: 0 }),
  error_reports: Object.freeze({ minute: 10, hour: 60, active: 0 }),
  issue_reports: Object.freeze({ minute: 3, hour: 30, active: 0 }),
});
export type PublicApiCategory = keyof typeof PUBLIC_API_LIMITS;
export const PUBLIC_API_LEASE_MS = 90_000;
export const PUBLIC_API_MAX_ROWS = 1_000;
const DATABASE_TIMEOUT_MS = 2_500;
// D1's clock, not a request timestamp or an isolate's possibly stale pre-I/O clock.
// Integer seconds are intentional; the lease lasts at most 90 wall-clock seconds.
const DATABASE_NOW = "(CAST(strftime('%s','now') AS INTEGER) * 1000)";

type Denial = { allowed: false; status: 429 | 503; code: 'PUBLIC_RATE_LIMIT' | 'PUBLIC_ADMISSION_UNAVAILABLE'; retryAfter: number };
export type PublicApiAdmission = Denial | {
  allowed: true;
  /** Release the active slot only. The attempt remains counted for a full hour. */
  release: () => Promise<void>;
  /** Fresh D1 check after source parsing, immediately before a provider request.
   * Returns a bounded timeout, or null on expired/uncertain/unavailable lease.
   * Do not perform any unbounded work between this check and the provider fetch. */
  providerTimeoutMs: () => Promise<number | null>;
};
const unavailable = (): Denial => ({ allowed: false, status: 503, code: 'PUBLIC_ADMISSION_UNAVAILABLE', retryAfter: 60 });
const limited = (): Denial => ({ allowed: false, status: 429, code: 'PUBLIC_RATE_LIMIT', retryAfter: 60 });

async function bounded<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('admission_unavailable')), DATABASE_TIMEOUT_MS);
    })]);
  } finally { clearTimeout(timer); }
}

/** Cheap transport checks, before D1 or body reads. Origin is a CSRF guard,
 * not an identity or a bot filter; the global D1 budget is the abuse bound. */
export function publicJsonRequestError(request: Request): { status: number; code: string } | null {
  if (request.method !== 'POST') return { status: 405, code: 'METHOD_NOT_ALLOWED' };
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) return { status: 403, code: 'ORIGIN_MISMATCH' };
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i.test(request.headers.get('content-type') ?? '')) {
    return { status: 415, code: 'JSON_REQUIRED' };
  }
  const encoding = request.headers.get('content-encoding');
  if (encoding && encoding.toLowerCase() !== 'identity') return { status: 415, code: 'JSON_REQUIRED' };
  return null;
}

/** Admission is one serialized D1 transaction, never a SELECT followed by a
 * conditional application-side INSERT. Even rejected/invalid later work consumes
 * its confirmed reservation. An ambiguous write is not retried or bypassed.
 * Persisted fields: random UUID, fixed route, server creation time, active expiry.
 * Never pass request content, headers, keys, hashes, user IDs or IPs here. */
export async function admitPublicApi(database: D1Database | undefined, category: PublicApiCategory): Promise<PublicApiAdmission> {
  if (!database || !Object.hasOwn(PUBLIC_API_LIMITS, category)) return unavailable();
  const limit = PUBLIC_API_LIMITS[category];
  const id = crypto.randomUUID();
  try {
    const results = await bounded(database.batch([
      // Bound the deletion even if an older release accidentally left extra rows.
      // Never evict a still-counting attempt just to admit a new one.
      database.prepare(`DELETE FROM public_api_admissions WHERE request_id IN (
        SELECT request_id FROM public_api_admissions WHERE created_at <= ${DATABASE_NOW} - 3600000
        ORDER BY created_at ASC LIMIT ?
      )`).bind(PUBLIC_API_MAX_ROWS),
      database.prepare(`INSERT INTO public_api_admissions (request_id, route, created_at, active_lease_until)
        SELECT ?, ?, ${DATABASE_NOW}, CASE WHEN ? > 0 THEN ${DATABASE_NOW} + ? ELSE NULL END
        WHERE (SELECT count(*) FROM public_api_admissions) < ?
        AND (SELECT count(*) FROM public_api_admissions WHERE route = ? AND created_at > ${DATABASE_NOW} - 60000) < ?
        AND (SELECT count(*) FROM public_api_admissions WHERE route = ? AND created_at > ${DATABASE_NOW} - 3600000) < ?
        AND (? = 0 OR (SELECT count(*) FROM public_api_admissions WHERE route = ? AND active_lease_until > ${DATABASE_NOW}) < ?)
        RETURNING request_id, route, created_at, active_lease_until`)
        .bind(id, category, limit.active, PUBLIC_API_LEASE_MS, PUBLIC_API_MAX_ROWS,
          category, limit.minute, category, limit.hour, limit.active, category, limit.active),
    ]));
    if (results.length !== 2 || results.some(result => result.success !== true)) return unavailable();
    const inserted = results[1];
    if (inserted.meta?.changes === 0 && Array.isArray(inserted.results) && inserted.results.length === 0) return limited();
    if (inserted.meta?.changes !== 1 || !Array.isArray(inserted.results) || inserted.results.length !== 1) return unavailable();
    const row = inserted.results[0] as { request_id?: unknown; route?: unknown; created_at?: unknown; active_lease_until?: unknown };
    if (row.request_id !== id || row.route !== category || !Number.isSafeInteger(row.created_at) || (row.created_at as number) < 0 ||
      (limit.active > 0 ? row.active_lease_until !== (row.created_at as number) + PUBLIC_API_LEASE_MS : row.active_lease_until !== null)) return unavailable();
    let released = false;
    return {
      allowed: true,
      async release() {
        if (released || limit.active === 0) return;
        released = true;
        try {
          await bounded(database.prepare('UPDATE public_api_admissions SET active_lease_until = NULL WHERE request_id = ? AND route = ?')
            .bind(id, category).run());
        } catch { /* No retry, raw error or fallback. The <=90-second lease expires. */ }
      },
      async providerTimeoutMs() {
        if (released || category !== 'rewrite') return null;
        try {
          const result = await bounded(database.prepare(`SELECT active_lease_until - ${DATABASE_NOW} AS remaining
            FROM public_api_admissions WHERE request_id = ? AND route = 'rewrite' AND active_lease_until > ${DATABASE_NOW}`)
            .bind(id).all<{ remaining: number }>());
          if (result.success !== true || result.results.length !== 1) return null;
          const remaining = result.results[0].remaining;
          // 1s clock granularity + the bounded DB response delay get a safety margin.
          if (!Number.isSafeInteger(remaining) || remaining <= 5_000 || remaining > PUBLIC_API_LEASE_MS) return null;
          return Math.min(60_000, remaining - 5_000);
        } catch { return null; }
      },
    };
  } catch {
    // The DB operation may have committed despite a transport failure/timeout.
    // Keep any reservation; never call a provider or fall back to local counters.
    return unavailable();
  }
}
