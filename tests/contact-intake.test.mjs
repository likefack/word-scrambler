import { admissionFixtureModule } from './helpers/admission-fixture.mjs';
// Synthetic data only. No email is sent and no hosted database is accessed.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { Miniflare } from 'miniflare';
const root = new URL('../', import.meta.url);
const source = name => readFileSync(new URL(name, root), 'utf8');
const temp = mkdtempSync(join(tmpdir(), 'contact-intake-'));
const transpile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const url = path => pathToFileURL(path).href;
const librarySource = source('lib/contact-intake.ts');
const routeSource = source('app/api/contact/route.ts');
const componentSource = source('app/contact/contact-form.tsx');
const libraryPath = join(temp, 'contact-intake.mjs');
writeFileSync(libraryPath, transpile(librarySource));
const mailLibrarySource=source('lib/contact-mail-auth.ts');
const mailLibraryPath=join(temp,'contact-mail-auth.mjs');
writeFileSync(mailLibraryPath,transpile(mailLibrarySource));
const contract = await import(url(libraryPath));
const admissionPath=join(temp,'unit-admission.mjs');
writeFileSync(admissionPath,admissionFixtureModule(source('lib/public-api-admission.ts')));
const originalNow = Date.now;
const originalFetch = globalThis.fetch;
after(() => { Date.now = originalNow; globalThis.fetch = originalFetch; rmSync(temp, { recursive: true, force: true }); });
const secret = 'gsk_SYNTHETIC_DO_NOT_PERSIST_123456789';
const input = (changes = {}) => ({ email: '', subject: 'Synthetic question', body: 'Synthetic report body.', consent: true, consentVersion: contract.CONTACT_CONSENT_VERSION, replyRequested: false, website: '', ...changes });
const headers = { Origin: 'https://private-site.example', 'Content-Type': 'application/json' };
const request = (body = input(), options = {}) => new Request('https://private-site.example/api/contact', { method: 'POST', headers: { ...headers, ...options.headers }, body: options.raw ?? JSON.stringify(body) });
async function fixture({ fastTimeout = false } = {}) {
  const directory = mkdtempSync(join(temp, 'route-'));
  const contextPath = join(directory, 'context.mjs');
  writeFileSync(contextPath, `export const state = {user:{userId:'synthetic-auth-id',email:'auth-only@example.invalid'},env:{},authError:null}; export const env=state.env; export async function getChatGPTUser(){if(state.authError)throw state.authError;return state.user;}`);
  const routePath = join(directory, 'route.mjs');
  let route = transpile(routeSource).replace(/(['"])cloudflare:workers\1/g, JSON.stringify(url(contextPath)))
    .replace(/(['"])\.\.\/\.\.\/\.\.\/lib\/public-api-admission\1/g, JSON.stringify(url(admissionPath)))
    .replace(/(['"])\.\.\/\.\.\/chatgpt-auth\1/g, JSON.stringify(url(contextPath)))
    .replace(/(['"])\.\.\/\.\.\/\.\.\/lib\/contact-intake\1/g, JSON.stringify(url(libraryPath)))
    .replace(/(['"])\.\.\/\.\.\/\.\.\/lib\/contact-mail-auth\1/g, JSON.stringify(url(mailLibraryPath)));
  if (fastTimeout) route = route.replace('const BODY_TIMEOUT_MS = 10_000;', 'const BODY_TIMEOUT_MS = 10;');
  writeFileSync(routePath, route);
  const { state } = await import(url(contextPath));
  const routeModule = await import(url(routePath));
  const operations = [];
  const rows = [];
  state.env.DB = {
    prepare(sql) { return { bind(...values) { return { sql, values }; } }; },
    async batch(statements) {
      operations.push(statements);
      const [submission_id, reply_email, subject, body, consent_version, consented_at, reply_requested, server_received_at] = statements[1].values;
      rows.push({ submission_id, reply_email, subject, body, consent_version, consented_at, reply_requested, server_received_at, status: 'pending' });
      return statements.map((_, i) => ({ success: true, meta: { changes: i === 1 ? 1 : 0 }, results: i === 3 ? [{ submission_id, server_received_at }] : [] }));
    },
  };
  return { state, operations, rows, ...routeModule };
}
async function expectCode(response, status, code) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { code });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}

test('validation requires separate storage and own-address reply consent, with strict field bounds', () => {
  assert.ok(contract.validateContactInput(input()).ok);
  assert.ok(contract.validateContactInput(input({ email: 'sender@example.invalid', replyRequested: true })).ok);
  const rejected = [null, [], true, {}, input({ unknown: 'x' }), input({ consent: false }), input({ consent: 'true' }), input({ consentVersion: 'outdated' }),
    input({ subject: ' ' }), input({ body: '' }), input({ subject: 'a'.repeat(121) }), input({ body: 'あ'.repeat(4001) }), input({ email: 'a'.repeat(255) }),
    input({ email: 'sender@example.invalid' }), input({ replyRequested: true }), input({ email: 'a\r\nBcc: other@example.invalid', replyRequested: true }),
    input({ email: 'not-an-address', replyRequested: true }), input({ email: '.a@example.invalid', replyRequested: true }), input({ email: 'a..a@example.invalid', replyRequested: true }),
    input({ subject: 'New\nHeader' }), input({ body: '\u0000' }), input({ website: 'bot-filled' }), input({ website: false }),
    JSON.parse(`{"__proto__":{},${JSON.stringify(input()).slice(1)}`),
  ];
  for (const value of rejected) assert.equal(contract.validateContactInput(value).ok, false, JSON.stringify(value));
  assert.ok(contract.validateContactInput(input({ subject: 'a'.repeat(120), body: 'あ'.repeat(4000) })).ok);
  assert.ok(contract.validateContactInput(input({ body: 'Normal\nmultiline\ttext' })).ok);
});

test('recognizable API keys, passwords, bearer tokens and private keys are blocked before saving', () => {
  const secrets = [secret, 'sk-proj-synthetic_FAKE_12345678', 'ghp_syntheticFAKE123456789', 'Bearer SyntheticFAKE12345678', 'password: synthetic-secret', 'パスワード：synthetic-secret', '-----BEGIN RSA PRIVATE KEY-----'];
  for (const value of secrets) for (const key of ['subject', 'body']) {
    assert.equal(contract.validateContactInput(input({ [key]: value })).code, 'CONTACT_SECRET_BLOCKED');
  }
  assert.ok(contract.validateContactInput(input({ body: 'APIキーの取得方法について質問があります。キー自体は添付しません。' })).ok);
  assert.equal(contract.escapeContactHtml(`<img src=x onerror="x">&'`), '&lt;img src=x onerror=&quot;x&quot;&gt;&amp;&#39;');
});

test('anonymous same-origin strict JSON POST only, without public reading or writing admin routes', async () => {
  const f = await fixture();
  for (const method of ['GET', 'PATCH', 'PUT', 'DELETE']) assert.equal(f[method], undefined);
  f.state.user = null; // Public intake does not consult an identity.
  f.state.user = { userId: 'synthetic-auth-id' };
  for (const Origin of ['', 'null', 'http://private-site.example', 'https://evil.example', 'https://private-site.example.evil']) await expectCode(await f.POST(request(undefined, { headers: { Origin } })), 403, 'ORIGIN_MISMATCH');
  for (const contentType of ['text/plain', 'application/jsonp', 'text/plain;application/json', 'application/json; charset=iso-8859-1']) await expectCode(await f.POST(request(undefined, { headers: { 'Content-Type': contentType } })), 415, 'CONTACT_JSON_REQUIRED');
  await expectCode(await f.POST(request(undefined, { headers: { 'Content-Encoding': 'gzip' } })), 415, 'CONTACT_JSON_REQUIRED');
  await expectCode(await f.POST(new Request('https://private-site.example/api/contact')), 405, 'CONTACT_METHOD');
  assert.equal(f.operations.length, 0);
  assert.equal((await f.POST(request(undefined, { headers: { 'Content-Type': 'application/json; charset="utf-8"' } }))).status, 201);
});

test('malformed, oversize, invalid UTF-8, consent-free, honeypot and secret requests never reach SQL', async () => {
  const cases = [
    [request(undefined, { raw: 'x'.repeat(contract.CONTACT_REQUEST_BYTE_LIMIT + 1) }), 413, 'CONTACT_TOO_LARGE'],
    [request(undefined, { headers: { 'Content-Length': String(contract.CONTACT_REQUEST_BYTE_LIMIT + 1) } }), 413, 'CONTACT_TOO_LARGE'],
    [request(undefined, { headers: { 'Content-Length': '-1' } }), 400, 'CONTACT_INVALID'],
    [request(undefined, { raw: 'あ'.repeat(9000) }), 413, 'CONTACT_TOO_LARGE'],
    ...['{', '[]', 'null', '"text"'].map(raw => [request(undefined, { raw }), 400, 'CONTACT_INVALID']),
    [request(input({ consent: false })), 400, 'CONTACT_CONSENT_REQUIRED'],
    [request(input({ website: 'spam' })), 400, 'CONTACT_INVALID'],
    [request(input({ body: secret })), 400, 'CONTACT_SECRET_BLOCKED'],
    [new Request('https://private-site.example/api/contact', { method: 'POST', headers, body: new Uint8Array([0xc0, 0xaf]) }), 400, 'CONTACT_INVALID'],
  ];
  for (const [req, status, code] of cases) { const f = await fixture(); await expectCode(await f.POST(req), status, code); assert.equal(f.operations.length, 0); }
});

test('server generates receipt UUID, binds only approved fields, does not echo input, and uses fixed SQL', async () => {
  const f = await fixture();
  const value = input({ email: 'reply@example.invalid', replyRequested: true, subject: "Question'); DROP TABLE contact_submissions; --", body: '<script>do not execute this text</script>' });
  const response = await f.POST(request(value));
  assert.equal(response.status, 201);
  const receipt = await response.json();
  assert.ok(contract.isContactSubmissionId(receipt.submissionId));
  assert.deepEqual(Object.keys(receipt).sort(), ['serverReceivedAt', 'submissionId']);
  assert.equal(f.rows[0].subject, value.subject);
  assert.equal(f.rows[0].body, value.body);
  assert.equal(f.rows[0].reply_email, value.email);
  assert.equal(f.rows[0].consented_at, receipt.serverReceivedAt);
  assert.equal(f.rows[0].status, 'pending');
  assert.equal(f.operations[0][2].values[0], 1000);
  for (const operation of f.operations[0]) { assert.equal((operation.sql.match(/\?/g) || []).length, operation.values.length); assert.ok(!operation.sql.includes(value.subject)); assert.ok(!operation.sql.includes(value.email)); }
  assert.ok(!JSON.stringify(f.operations).includes('synthetic-auth-id'));
  assert.ok(!JSON.stringify(f.operations).includes('auth-only@example.invalid'));
  assert.doesNotMatch(routeSource, /console\s*\.|fetch\s*\(|CREATE TABLE|ALTER TABLE|INSERT[^]*\$\{/);
  assert.doesNotMatch(source('app/contact/page.tsx') + componentSource + routeSource, /mailto:|smtp|recipient@example/i);
});

// Former per-isolate/auth case is superseded by public-api-admission.test.mjs,
// which uses independent Workerd instances and real shared D1 transactions.

// Former per-isolate/auth case is superseded by public-api-admission.test.mjs,
// which uses independent Workerd instances and real shared D1 transactions.

test('read timeout does not await a stuck producer cancellation and releases active guard', async () => {
  const f = await fixture({ fastTimeout: true });
  let cancelled = false;
  const body = new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancelled = true; return new Promise(() => {}); } });
  const req = new Request('https://private-site.example/api/contact', { method: 'POST', headers, body, duplex: 'half' });
  await expectCode(await f.POST(req), 408, 'CONTACT_TIMEOUT');
  assert.ok(cancelled);
  assert.equal(f.operations.length, 0);
  assert.equal((await f.POST(request())).status, 201);
});

test('database absence/errors/missing receipts are honest failures without exception leaks', async () => {
  const cases = [
    f => { f.state.env.DB = undefined; },
    f => { f.state.env.DB = { prepare() { throw new Error(secret); } }; },
    f => { f.state.env.DB.batch = async () => [{ success: false }]; },
    f => { f.state.env.DB.batch = async () => Array.from({ length: 4 }, () => ({ success: true, results: [], meta: { changes: 1 } })); },
  ];
  for (const change of cases) { const f = await fixture(); change(f); await expectCode(await f.POST(request()), 503, 'CONTACT_UNAVAILABLE'); }
});

async function runtimeFixture({ migrate = true } = {}) {
  const script = `${readFileSync(admissionPath,'utf8').replace(/^export /gm,'')}\n${transpile(mailLibrarySource).replace(/^export /gm, '')}\n${transpile(librarySource).replace(/^export /gm, '')}\n${transpile(routeSource).replace(/^export /gm, '')
    .replace(/import\s*\{[^}]*\}\s*from ['"]\.\.\/\.\.\/\.\.\/lib\/public-api-admission['"];?/, '')
    .replace(/import\s*\{[^}]*\}\s*from ['"]\.\.\/\.\.\/chatgpt-auth['"];?/, 'async function getChatGPTUser(){return {userId:"synthetic-auth-id"};}')
    .replace(/import\s*\{[^}]*\}\s*from ['"]\.\.\/\.\.\/\.\.\/lib\/contact-intake['"];?/, '')
    .replace(/import\s*\{[^}]*\}\s*from ['"]\.\.\/\.\.\/\.\.\/lib\/contact-mail-auth['"];?/, '')}\nexport default {fetch:POST};`;
  const mf = new Miniflare({ modules: true, script, compatibilityDate: '2026-05-15', d1Databases: { DB: 'contact-synthetic-fixture' }, outboundService: () => { throw new Error('External network is forbidden'); } });
  try {
    const database = await mf.getD1Database('DB');
    if (migrate) for (const sql of source('drizzle/0002_contact_submissions.sql').split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) await database.prepare(sql).run();
    return { mf, database, send: (value = input()) => mf.dispatchFetch('https://private-site.example/api/contact', { method: 'POST', headers, body: JSON.stringify(value) }) };
  } catch (error) { await mf.dispose(); throw error; }
}
const insert = `INSERT INTO contact_submissions (submission_id, reply_email, subject, body, consent_version, consented_at, reply_requested, server_received_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`;
function seed(database, timestamp, changes = {}) { return database.prepare(insert).bind(crypto.randomUUID(), changes.email ?? null, changes.subject ?? 'Synthetic seeded question', changes.body ?? 'Synthetic seeded content', contract.CONTACT_CONSENT_VERSION, timestamp, changes.replyRequested ?? 0, timestamp); }

test('actual workerd + D1 stores exact plain text, enforces schema, lazy 30-day cleanup and 1000-record cap', async () => {
  const f = await runtimeFixture();
  try {
    const columns = (await f.database.prepare('PRAGMA table_info(contact_submissions)').all()).results.map(row => row.name);
    assert.deepEqual(columns, ['submission_id', 'reply_email', 'subject', 'body', 'consent_version', 'consented_at', 'reply_requested', 'server_received_at', 'status']);
    const value = input({ email: 'sender@example.invalid', replyRequested: true, subject: "Synthetic ' ? -- question", body: '<img src=x onerror="alert(1)"> is inert text.\nAnother line.' });
    const response = await f.send(value); assert.equal(response.status, 201, await response.clone().text());
    const receipt = await response.json();
    const stored = await f.database.prepare('SELECT * FROM contact_submissions WHERE submission_id = ?').bind(receipt.submissionId).first();
    assert.equal(stored.body, value.body); assert.equal(stored.subject, value.subject); assert.equal(stored.reply_email, value.email); assert.equal(stored.reply_requested, 1);
    assert.equal(stored.consent_version, contract.CONTACT_CONSENT_VERSION); assert.equal(stored.consented_at, receipt.serverReceivedAt); assert.equal(stored.status, 'pending');
    await expectCode(await f.send(input({ body: secret })), 400, 'CONTACT_SECRET_BLOCKED');
    const expired = new Date(Date.now() - 31 * 24 * 60 * 60_000).toISOString();
    const retained = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    await seed(f.database, expired).run();
    assert.equal((await f.send()).status, 201);
    assert.equal((await f.database.prepare('SELECT count(*) AS count FROM contact_submissions WHERE server_received_at = ?').bind(expired).first()).count, 0);
    const seeds = Array.from({ length: 1005 }, () => seed(f.database, retained));
    for (let i = 0; i < seeds.length; i += 100) await f.database.batch(seeds.slice(i, i + 100));
    const capped = await f.send(); assert.equal(capped.status, 201, await capped.clone().text());
    assert.equal((await f.database.prepare('SELECT count(*) AS count FROM contact_submissions').first()).count, 1000);
    await assert.rejects(seed(f.database, retained, { email: 'sender@example.invalid', replyRequested: 0 }).run(), /CHECK constraint failed/);
    await assert.rejects(seed(f.database, retained, { body: 'a'.repeat(4001) }).run(), /CHECK constraint failed/);
    await assert.rejects(f.database.prepare("UPDATE contact_submissions SET status = 'forwarded'").run(), /CHECK constraint failed/);
    const rows = JSON.stringify((await f.database.prepare('SELECT * FROM contact_submissions').all()).results);
    assert.ok(!rows.includes(secret)); assert.ok(!rows.includes('synthetic-auth-id'));
  } finally { await f.mf.dispose(); }
});

test('actual D1 global cap survives fresh worker guard and missing schema returns unavailable', async () => {
  const f = await runtimeFixture();
  try {
    const timestamp = new Date(Date.now() - 1_000).toISOString();
    await f.database.batch(Array.from({ length: contract.CONTACT_HOURLY_LIMIT }, () => seed(f.database, timestamp)));
    await expectCode(await f.send(), 429, 'CONTACT_RATE_LIMIT');
    assert.equal((await f.database.prepare('SELECT count(*) AS count FROM contact_submissions').first()).count, 100);
  } finally { await f.mf.dispose(); }
  const missing = await runtimeFixture({ migrate: false });
  try { await expectCode(await missing.send(), 503, 'CONTACT_UNAVAILABLE'); } finally { await missing.mf.dispose(); }
});

test('form defaults to no consent, does not auto-send, blocks repeated clicks, and reports only verified receipt', async () => {
  const directory = mkdtempSync(join(temp, 'form-'));
  const contextPath = join(directory, 'react.mjs');
  writeFileSync(contextPath, `export const state={values:[],cursor:0}; export function useState(v){const i=state.cursor++;if(!(i in state.values))state.values[i]=v;return[state.values[i],next=>state.values[i]=next];} export function useRef(v){const i=state.cursor++;if(!(i in state.values))state.values[i]={current:v};return state.values[i];} export function jsx(type,props){return{type,props};} export const jsxs=jsx;`);
  const componentPath = join(directory, 'form.mjs');
  writeFileSync(componentPath, transpile(componentSource).replace(/(['"])react(?:\/jsx-runtime)?\1/g, JSON.stringify(url(contextPath))).replace(/(['"])\.\.\/\.\.\/lib\/contact-intake\1/g, JSON.stringify(url(libraryPath))));
  const { state } = await import(url(contextPath)); const { ContactForm } = await import(url(componentPath));
  const render = () => { state.cursor = 0; return ContactForm(); };
  const walk = node => { if (!node || typeof node !== 'object') return []; const children = node.props?.children; return [node, ...(Array.isArray(children) ? children : [children]).flatMap(walk)]; };
  let tree = render(); assert.equal(tree.type, 'form');
  for (const checkbox of walk(tree).filter(n => n.type === 'input' && n.props.type === 'checkbox')) assert.equal(checkbox.props.checked, false);
  const calls = []; let unblock; const blocked = new Promise(resolve => { unblock = resolve; });
  const id = crypto.randomUUID();
  globalThis.fetch = async (target, options) => { calls.push({ target, options }); await blocked; return Response.json({ submissionId: id, serverReceivedAt: new Date().toISOString() }, { status: 201 }); };
  try {
    assert.equal(calls.length, 0);
    await tree.props.onSubmit({ preventDefault() {} }); assert.equal(calls.length, 0);
    state.values[1] = 'Synthetic form subject'; state.values[2] = 'Synthetic form body'; state.values[3] = true;
    tree = render(); const pending = tree.props.onSubmit({ preventDefault() {} });
    await tree.props.onSubmit({ preventDefault() {} }); assert.equal(calls.length, 1);
    unblock(); await pending;
    assert.equal(calls[0].target, '/api/contact'); assert.equal(calls[0].options.redirect, 'manual');
    assert.equal(JSON.parse(calls[0].options.body).email, '');
    tree = render(); assert.equal(tree.type, 'section'); assert.ok(JSON.stringify(tree).includes(id));
    assert.equal(state.values[1], ''); assert.equal(state.values[2], ''); assert.equal(state.values[3], false);
    assert.doesNotMatch(componentSource, /useEffect|sendBeacon|localStorage|sessionStorage|dangerouslySetInnerHTML|console\s*\./);
  } finally { globalThis.fetch = originalFetch; }
});

test('form preserves input after storage/network errors, does not retry on rerender, and does not trust malformed receipt', async () => {
  const directory = mkdtempSync(join(temp, 'form-failure-'));
  const contextPath = join(directory, 'react.mjs');
  writeFileSync(contextPath, `export const state={values:[],cursor:0}; export function useState(v){const i=state.cursor++;if(!(i in state.values))state.values[i]=v;return[state.values[i],next=>state.values[i]=next];} export function useRef(v){const i=state.cursor++;if(!(i in state.values))state.values[i]={current:v};return state.values[i];} export function jsx(type,props){return{type,props};} export const jsxs=jsx;`);
  const componentPath = join(directory, 'form.mjs');
  writeFileSync(componentPath, transpile(componentSource).replace(/(['"])react(?:\/jsx-runtime)?\1/g, JSON.stringify(url(contextPath))).replace(/(['"])\.\.\/\.\.\/lib\/contact-intake\1/g, JSON.stringify(url(libraryPath))));
  const { state } = await import(url(contextPath)); const { ContactForm } = await import(url(componentPath));
  const render = () => { state.cursor = 0; return ContactForm(); };
  render(); state.values[1] = 'Preserve subject'; state.values[2] = 'Preserve report content'; state.values[3] = true;
  let calls = 0;
  try {
    for (const response of [() => Response.json({ code: 'CONTACT_UNAVAILABLE' }, { status: 503 }), () => { throw new Error(secret); }, () => Response.json({ submissionId: '<script>fake receipt</script>' }, { status: 201 })]) {
      globalThis.fetch = async () => { calls++; return response(); };
      const before = calls;
      await render().props.onSubmit({ preventDefault() {} });
      assert.equal(calls, before + 1);
      const rendered = render();
      assert.equal(calls, before + 1); assert.equal(rendered.type, 'form');
      assert.equal(state.values[1], 'Preserve subject'); assert.equal(state.values[2], 'Preserve report content'); assert.equal(state.values[8], '');
      assert.ok(!JSON.stringify(rendered).includes(secret)); assert.ok(!JSON.stringify(rendered).includes('<script>fake receipt</script>'));
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('credential prefixes are detected even when attached to a preceding word',()=>{for(const prefix of ['mykey','credential=','日本語'])assert.deepEqual(contract.validateContactInput(input({body:prefix+secret})),{ok:false,code:'CONTACT_SECRET_BLOCKED'});});
