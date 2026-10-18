// Dummy diagnostics only. No real credentials, external requests, or hosted DBs.
// Runtime integration below executes the actual handler and SQL in Miniflare/workerd.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { Miniflare } from 'miniflare';

const root = new URL('../', import.meta.url);
const source = file => readFileSync(new URL(file, root), 'utf8');
const temp = mkdtempSync(join(tmpdir(), 'error-reports-'));
const transpile = value => ts.transpileModule(value, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const url = path => pathToFileURL(path).href;
const librarySource = source('lib/error-reports.ts');
const routeSource = source('app/api/error-reports/route.ts');
const libraryPath = join(temp, 'error-reports.mjs');
writeFileSync(libraryPath, transpile(librarySource));
const limits = await import(url(libraryPath));
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
after(() => { globalThis.fetch = originalFetch; Date.now = originalNow; rmSync(temp, { recursive: true, force: true }); });
const secret = 'gsk_fixture_NEVER_PERSIST_this_value';
const email = 'fixture-owner@example.invalid';
const diagnostic = (overrides = {}) => ({
  code: 'PROVIDER_REDIRECT_BLOCKED', stage: 'provider_status', httpStatus: 502,
  upstreamStatus: 302, version: '2026.10.18-r4', requestId: crypto.randomUUID(),
  timestamp: new Date().toISOString(), ...overrides,
});
const clientDiagnostic = () => diagnostic({ code: 'CLIENT_NETWORK_ERROR', stage: 'client_network', httpStatus: 0, requestId: 'unavailable' });
const headers = reportId => ({ origin: 'https://private-site.example', 'Content-Type': 'application/json', 'X-Report-Id': reportId || crypto.randomUUID() });
const request = (body = diagnostic(), options = {}) => new Request('https://private-site.example/api/error-reports', {
  method: 'POST', headers: { ...headers(options.reportId), ...options.headers },
  body: options.raw ?? JSON.stringify(body),
});

async function fixture() {
  const directory = mkdtempSync(join(temp, 'route-'));
  const contextPath = join(directory, 'context.mjs');
  writeFileSync(contextPath, `export const state = { user: {userId: 'fixture-owner', email: ${JSON.stringify(email)}}, env: {}, authError: null }; export const env = state.env; export async function getChatGPTUser() { if(state.authError) throw state.authError; return state.user; }`);
  const routePath = join(directory, 'route.mjs');
  writeFileSync(routePath, transpile(routeSource)
    .replace(/(['"])cloudflare:workers\1/g, JSON.stringify(url(contextPath)))
    .replace(/(['"])\.\.\/\.\.\/chatgpt-auth\1/g, JSON.stringify(url(contextPath)))
    .replace(/(['"])\.\.\/\.\.\/\.\.\/lib\/error-reports\1/g, JSON.stringify(url(libraryPath))));
  const { state } = await import(url(contextPath));
  const routeModule = await import(url(routePath));
  const operations = [];
  const rows = [];
  state.env.DB = {
    prepare(sql) { return { bind(...values) { return { sql, values }; } }; },
    async batch(statements) {
      operations.push(statements);
      const [report_id, request_id, code, stage, http_status, upstream_status, version, timestamp, server_received_at] = statements[1].values;
      let row = rows.find(row => row.report_id === report_id || (request_id !== 'unavailable' && row.request_id === request_id));
      if (!row) { row = { report_id, request_id, code, stage, http_status, upstream_status, version, timestamp, server_received_at }; rows.push(row); }
      return statements.map((_, index) => ({ success: true, results: index === 3 ? [{ report_id: row.report_id, server_received_at: row.server_received_at }] : [] }));
    },
  };
  return { state, ...routeModule, operations, rows };
}

async function expectCode(response, status, code) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { code });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}

test('shared projection removes unknown secrets before serialization; server validation rejects them', () => {
  const good = diagnostic();
  const contaminated = { ...good, apiKey: secret, text: 'PRIVATE INPUT', error: 'RAW ERROR', email, ip: '192.0.2.1', nested: { token: secret } };
  assert.deepEqual(limits.projectErrorReportDiagnostic(contaminated), good);
  assert.equal(limits.validateErrorReportDiagnostic(contaminated), null);
  assert.ok(!JSON.stringify(limits.projectErrorReportDiagnostic(contaminated)).includes(secret));
  for (const field of ['code', 'stage', 'version', 'requestId', 'timestamp']) {
    assert.equal(limits.projectErrorReportDiagnostic({ ...good, [field]: secret }), null);
  }
  assert.equal(limits.validateErrorReportDiagnostic(JSON.parse(`{"__proto__":{},${JSON.stringify(good).slice(1)}`)), null);
});

test('diagnostic enums, HTTP bounds, canonical dates, versions, and UUIDs are strict', () => {
  const now = Date.now();
  const good = diagnostic();
  for (const code of limits.ERROR_REPORT_CODES) assert.ok(limits.validateErrorReportDiagnostic({ ...good, code }));
  for (const stage of limits.ERROR_REPORT_STAGES) assert.ok(limits.validateErrorReportDiagnostic({ ...good, stage }));
  for (const value of [null, [], true, 'x', {}, { ...good, code: 'NOT_A_REAL_CODE' }, { ...good, stage: 'unknown' },
    { ...good, httpStatus: '502' }, { ...good, httpStatus: 99 }, { ...good, httpStatus: 600 }, { ...good, httpStatus: 0 },
    { ...good, upstreamStatus: 0 }, { ...good, upstreamStatus: 200.5 }, { ...good, upstreamStatus: null },
    { ...good, requestId: 'x'.repeat(36) }, { ...good, requestId: '00000000-0000-0000-0000-000000000000' },
    { ...good, requestId: 'unavailable' }, { ...good, version: '2026.02.30-r4' }, { ...good, version: '2026.10.18-r1234567' },
    { ...good, timestamp: '2026-02-30T00:00:00.000Z' }, { ...good, timestamp: new Date(now + 300_001).toISOString() },
    { ...good, timestamp: new Date(now - limits.ERROR_REPORT_RETENTION_MS - 1).toISOString() },
    { ...good, code: 'HTTP_502', httpStatus: 500 }, { ...good, code: 'HTTP_200', httpStatus: 200 },
  ]) assert.equal(limits.validateErrorReportDiagnostic(value, now), null, JSON.stringify(value));
  assert.ok(limits.validateErrorReportDiagnostic({ ...good, code: 'HTTP_502' }));
  assert.equal(limits.projectErrorReportDiagnostic(clientDiagnostic()).requestId, 'unavailable');
  const upper = { ...good, requestId: good.requestId.toUpperCase() };
  assert.equal(limits.validateErrorReportDiagnostic(upper).requestId, good.requestId);
  // Catch additions to current API/page diagnostics that lack a reporting enum.
  const emitted = ['app/api/rewrite/route.ts', 'app/page.tsx', 'lib/rewriter.ts'].flatMap(file => [...source(file).matchAll(/'([A-Z][A-Z0-9_]+)'/g)].map(match => match[1]));
  for (const code of emitted.filter(code => !['POST', 'HTTP_'].includes(code))) assert.ok(limits.ERROR_REPORT_CODES.includes(code), code);
});

test('only authenticated same-origin JSON POST is accepted, with no listing endpoint', async () => {
  const f = await fixture();
  assert.equal(f.GET, undefined);
  f.state.user = null;
  await expectCode(await f.POST(request()), 401, 'AUTH_REQUIRED');
  f.state.user = { userId: '' };
  await expectCode(await f.POST(request()), 401, 'AUTH_REQUIRED');
  f.state.user = { userId: 'fixture-owner', email };
  for (const origin of ['', 'null', 'https://other.example', 'https://private-site.example.evil', 'http://private-site.example']) {
    await expectCode(await f.POST(request(undefined, { headers: { origin } })), 403, 'ORIGIN_MISMATCH');
  }
  for (const contentType of ['text/plain', 'application/jsonp', 'text/plain; application/json', 'application/json; charset=iso-8859-1']) {
    await expectCode(await f.POST(request(undefined, { headers: { 'Content-Type': contentType } })), 415, 'REPORT_JSON_REQUIRED');
  }
  await expectCode(await f.POST(request(undefined, { headers: { 'Content-Encoding': 'gzip' } })), 415, 'REPORT_JSON_REQUIRED');
  for (const id of ['', secret, 'unavailable']) await expectCode(await f.POST(request(undefined, { headers: { 'X-Report-Id': id } })), 400, 'REPORT_INVALID');
  await expectCode(await f.POST(new Request('https://private-site.example/api/error-reports')), 405, 'REPORT_METHOD');
  assert.equal(f.operations.length, 0);
  assert.equal((await f.POST(request(undefined, { headers: { 'Content-Type': 'application/json; charset="utf-8"' } }))).status, 200);
});

test('byte-size, malformed JSON, unknown fields, and invalid UTF-8 fail before SQL', async () => {
  const f = await fixture();
  await expectCode(await f.POST(request(undefined, { raw: 'x'.repeat(1025) })), 413, 'REPORT_TOO_LARGE');
  await expectCode(await f.POST(request(undefined, { headers: { 'Content-Length': '1025' } })), 413, 'REPORT_TOO_LARGE');
  await expectCode(await f.POST(request(undefined, { headers: { 'Content-Length': '-1' } })), 400, 'REPORT_INVALID');
  await expectCode(await f.POST(request(undefined, { raw: 'あ'.repeat(400) })), 413, 'REPORT_TOO_LARGE');
  for (const raw of ['null', '[]', '{', '"text"']) await expectCode(await f.POST(request(undefined, { raw })), 400, 'REPORT_INVALID');
  await expectCode(await f.POST(request({ ...diagnostic(), apiKey: secret })), 400, 'REPORT_INVALID');
  const invalidUtf8 = new Request('https://private-site.example/api/error-reports', { method: 'POST', headers: headers(), body: new Uint8Array([0xc0, 0xaf]) });
  await expectCode(await f.POST(invalidUtf8), 400, 'REPORT_INVALID');
  assert.equal(f.operations.length, 0);
});

test('rate protection limits ten attempts per minute and one active request per instance', async () => {
  const f = await fixture();
  for (let index = 0; index < 10; index++) assert.equal((await f.POST(request())).status, 200);
  const limited = await f.POST(request());
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  await expectCode(limited, 429, 'REPORT_RATE_LIMIT');
  const g = await fixture();
  const underlyingBatch = g.state.env.DB.batch;
  let unblock;
  let notify;
  const blocked = new Promise(resolve => { unblock = resolve; });
  const started = new Promise(resolve => { notify = resolve; });
  g.state.env.DB.batch = async statements => { notify(); await blocked; return underlyingBatch(statements); };
  const pending = g.POST(request());
  await started;
  await expectCode(await g.POST(request()), 429, 'REPORT_BUSY');
  unblock();
  assert.equal((await pending).status, 200);
});

test('hundred-attempt rolling-hour bound also applies across minute windows', async () => {
  const f = await fixture();
  const start = originalNow();
  let now = start;
  Date.now = () => now;
  try {
    for (let minute = 0; minute < 10; minute++) {
      now = start + minute * 60_000;
      for (let attempt = 0; attempt < 10; attempt++) assert.equal((await f.POST(request(diagnostic()))).status, 200);
    }
    now = start + 10 * 60_000;
    await expectCode(await f.POST(request()), 429, 'REPORT_RATE_LIMIT');
    now = start + 60 * 60_000;
    assert.equal((await f.POST(request())).status, 200);
  } finally { Date.now = originalNow; }
});

test('only whitelist scalars are bound to fixed SQL; real request IDs and report IDs deduplicate separately', async () => {
  const f = await fixture();
  const d = diagnostic();
  const reportId = crypto.randomUUID();
  const first = await (await f.POST(request(d, { reportId }))).json();
  assert.equal(first.reportId, reportId);
  assert.deepEqual(Object.keys(first).sort(), ['reportId', 'serverReceivedAt']);
  const duplicate = await (await f.POST(request(d))).json();
  assert.deepEqual(duplicate, first);
  const missingRequest = clientDiagnostic();
  const clientReportId = crypto.randomUUID();
  const clientFirst = await (await f.POST(request(missingRequest, { reportId: clientReportId }))).json();
  assert.deepEqual(await (await f.POST(request(missingRequest, { reportId: clientReportId }))).json(), clientFirst);
  const distinct = await (await f.POST(request(missingRequest))).json();
  assert.notEqual(distinct.reportId, clientFirst.reportId);
  assert.equal(f.rows.length, 3);
  assert.equal(f.rows[1].request_id, 'unavailable');
  const operations = f.operations[0];
  assert.equal(operations.length, 4);
  assert.deepEqual(operations[1].values, [reportId, d.requestId, d.code, d.stage, d.httpStatus, d.upstreamStatus, d.version, d.timestamp, first.serverReceivedAt]);
  assert.equal(operations[2].values[0], 1000);
  for (const operation of operations) {
    assert.equal((operation.sql.match(/\?/g) || []).length, operation.values.length);
    assert.ok(!operation.sql.includes(d.requestId));
    assert.ok(!operation.sql.includes(reportId));
  }
  assert.ok(!JSON.stringify(f.operations).includes(email));
  assert.ok(!JSON.stringify(f.operations).includes('fixture-owner'));
  assert.doesNotMatch(routeSource, /console\s*\.|INSERT[^]*\$\{|CREATE TABLE|ALTER TABLE/);
});

test('storage/auth exceptions remain generic and release in-flight protection', async () => {
  const f = await fixture();
  f.state.authError = new Error(secret);
  await expectCode(await f.POST(request()), 503, 'REPORT_UNAVAILABLE');
  f.state.authError = null;
  const db = f.state.env.DB;
  f.state.env.DB = undefined;
  await expectCode(await f.POST(request()), 503, 'REPORT_UNAVAILABLE');
  f.state.env.DB = { prepare() { throw new Error(secret); } };
  await expectCode(await f.POST(request()), 503, 'REPORT_UNAVAILABLE');
  f.state.env.DB = db;
  assert.equal((await f.POST(request())).status, 200);
});

async function runtimeFixture() {
  // Only the auth helper is substituted. Production handler, validation, runtime
  // env binding, request streams, transaction, and SQL execute in workerd.
  const script = `${transpile(librarySource).replace(/^export /gm, "")}\n${transpile(routeSource).replace(/^export /gm, "")
    .replace(/import\s*\{[^}]*\}\s*from ['"]\.\.\/\.\.\/chatgpt-auth['"];?/, 'async function getChatGPTUser() { return { userId: "fixture-owner" }; }')
    .replace(/import\s*\{[^}]*\}\s*from ['"]\.\.\/\.\.\/\.\.\/lib\/error-reports['"];?/, '')}\nexport default {fetch: POST};`;
  const mf = new Miniflare({ modules: true, script, compatibilityDate: '2026-05-15', d1Databases: { DB: 'error-reports-fixture' }, outboundService: () => { throw new Error('External network is forbidden in these tests'); } });
  try {
    const database = await mf.getD1Database('DB');
    for (const statement of source('drizzle/0000_error_reports.sql').split('--> statement-breakpoint').map(value => value.trim()).filter(Boolean)) await database.prepare(statement).run();
    return { mf, database, send: (body, options = {}) => mf.dispatchFetch('https://private-site.example/api/error-reports', { method: 'POST', headers: { ...headers(options.reportId), ...options.headers }, body: JSON.stringify(body) }) };
  } catch (error) { await mf.dispose(); throw error; }
}

test('actual workerd + D1: schema columns, SQL, dedup, 30-day cleanup, cap, and zero private fields', async () => {
  const f = await runtimeFixture();
  try {
    const columns = (await f.database.prepare('PRAGMA table_info(error_reports)').all()).results.map(row => row.name);
    assert.deepEqual(columns, ['report_id', 'request_id', 'code', 'stage', 'http_status', 'upstream_status', 'version', 'timestamp', 'server_received_at']);
    const d = diagnostic();
    const reportId = crypto.randomUUID();
    const first = await f.send(d, { reportId });
    assert.equal(first.status, 200, await first.clone().text());
    const receipt = await first.json();
    assert.equal(receipt.reportId, reportId);
    assert.deepEqual(await (await f.send(d)).json(), receipt);
    const client = clientDiagnostic();
    const clientReportId = crypto.randomUUID();
    const clientReceipt = await (await f.send(client, { reportId: clientReportId })).json();
    assert.deepEqual(await (await f.send(client, { reportId: clientReportId })).json(), clientReceipt);
    assert.notEqual((await (await f.send(client)).json()).reportId, clientReportId);
    assert.equal((await f.database.prepare('SELECT count(*) AS count FROM error_reports').first()).count, 3);
    await expectCode(await f.send({ ...d, apiKey: secret, text: 'PRIVATE TEXT', email }), 400, 'REPORT_INVALID');
    await expectCode(await f.send({ ...d, code: "UNEXPECTED'); DROP TABLE error_reports; --" }), 400, 'REPORT_INVALID');
    const expiredAt = new Date(Date.now() - 31 * 24 * 60 * 60_000).toISOString();
    const recentAt = new Date(Date.now() - 1_000).toISOString();
    const insert = 'INSERT INTO error_reports (report_id, request_id, code, stage, http_status, upstream_status, version, timestamp, server_received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
    await f.database.prepare(insert).bind(crypto.randomUUID(), crypto.randomUUID(), 'TIMEOUT', 'provider_fetch', 504, null, d.version, d.timestamp, expiredAt).run();
    assert.equal((await f.send(diagnostic())).status, 200);
    // Verify age cleanup independently of the count cap.
    assert.equal((await f.database.prepare('SELECT count(*) AS count FROM error_reports WHERE server_received_at = ?').bind(expiredAt).first()).count, 0);
    assert.equal((await f.database.prepare('SELECT count(*) AS count FROM error_reports').first()).count, 4);
    const seeds = Array.from({ length: 1010 }, (_, i) => f.database.prepare(insert).bind(crypto.randomUUID(), crypto.randomUUID(), 'TIMEOUT', 'provider_fetch', 504, null, d.version, d.timestamp, i < 5 ? expiredAt : recentAt));
    for (let offset = 0; offset < seeds.length; offset += 100) await f.database.batch(seeds.slice(offset, offset + 100));
    const last = await f.send(diagnostic());
    assert.equal(last.status, 200, await last.clone().text());
    assert.equal((await f.database.prepare('SELECT count(*) AS count FROM error_reports').first()).count, 1000);
    assert.equal((await f.database.prepare('SELECT count(*) AS count FROM error_reports WHERE server_received_at = ?').bind(expiredAt).first()).count, 0);
    const stored = JSON.stringify((await f.database.prepare('SELECT * FROM error_reports').all()).results);
    for (const privateValue of [secret, email, 'PRIVATE TEXT', 'fixture-owner']) assert.ok(!stored.includes(privateValue));
  } finally { await f.mf.dispose(); }
});

test('button sends only on explicit click, strips unknown fields, and keeps idempotency ID on manual retry', async () => {
  const directory = mkdtempSync(join(temp, 'button-'));
  const contextPath = join(directory, 'react.mjs');
  writeFileSync(contextPath, `export const state={values:[],cursor:0}; export function useId(){return 'fixture-description';} export function useState(value){const i=state.cursor++; if(!(i in state.values))state.values[i]=value;return [state.values[i],next=>state.values[i]=next];} export function useRef(value){const i=state.cursor++;if(!(i in state.values))state.values[i]={current:value};return state.values[i];} export function jsx(type,props){return {type,props};} export const jsxs=jsx;`);
  const componentPath = join(directory, 'button.mjs');
  const componentSource = source('components/error-report-button.tsx');
  writeFileSync(componentPath, transpile(componentSource).replace(/(['"])react(?:\/jsx-runtime)?\1/g, JSON.stringify(url(contextPath))).replace(/(['"])\.\.\/lib\/error-reports\1/g, JSON.stringify(url(libraryPath))));
  const { state } = await import(url(contextPath));
  const { ErrorReportButton } = await import(url(componentPath));
  const d = { ...clientDiagnostic(), apiKey: secret, text: 'PRIVATE TEXT', email };
  const render = () => { state.cursor = 0; return ErrorReportButton({ diagnostic: d }); };
  const findButton = tree => tree.props.children.find(child => child?.type === 'button');
  const calls = [];
  globalThis.fetch = async (target, options) => { calls.push({ target, options }); if (calls.length === 1) throw new Error(secret); return Response.json({ reportId: options.headers['X-Report-Id'] }); };
  try {
    const firstRender = render();
    assert.equal(calls.length, 0);
    await findButton(firstRender).props.onClick();
    assert.equal(calls.length, 1);
    await findButton(render()).props.onClick();
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.headers['X-Report-Id'], calls[1].options.headers['X-Report-Id']);
    assert.equal(JSON.parse(calls[0].options.body).requestId, 'unavailable');
    assert.deepEqual(JSON.parse(calls[0].options.body), limits.projectErrorReportDiagnostic(d));
    assert.ok(!JSON.stringify(calls).includes(secret));
    assert.equal(calls[0].target, '/api/error-reports');
    assert.equal(calls[0].options.redirect, 'manual');
    assert.equal(findButton(render()).props.disabled, true);
    assert.doesNotMatch(componentSource, /useEffect|sendBeacon|localStorage|sessionStorage|console\s*\./);
  } finally { globalThis.fetch = originalFetch; }
});
