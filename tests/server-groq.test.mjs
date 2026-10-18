// Source-level tests only: authentication, runtime bindings, and fetch are mocked.
// These tests never contact Groq, configure hosted secrets, or use real keys.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const temp = mkdtempSync(join(tmpdir(), 'scrambler-server-'));
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; rmSync(temp, { recursive: true, force: true }); });
const ownerKey = 'gsk_owner_fixture_only_not_a_real_key';
const visitorKey = 'gsk_visitor_fixture_only_not_a_real_key';
const input = 'Please review the document before the meeting.';
let fixtureNumber = 0;

async function fixture(testRetainedOwnerCode = false) {
  const directory = mkdtempSync(join(temp, `fixture-${fixtureNumber++}-`));
  const url = name => pathToFileURL(join(directory, `${name}.mjs`)).href;
  writeFileSync(join(directory, 'context.mjs'), 'export const state = { env: {}, user: { userId: "test-user" } }; export const env = state.env;');
  const featureSource = readFileSync(new URL('../lib/features.ts', import.meta.url),'utf8');
  const featureJs = ts.transpileModule(featureSource,{compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText;
  writeFileSync(join(directory,'features.mjs'),testRetainedOwnerCode?featureJs.replace('= false','= true'):featureJs);
  writeFileSync(join(directory, 'auth.mjs'), `import {state} from ${JSON.stringify(url('context'))}; export async function getChatGPTUser(){return state.user;}`);
  for (const [name, relative] of [
    ['rewriter-grammar', 'lib/rewriter-grammar.ts'],
    ['rewriter', 'lib/rewriter.ts'],
    ['server-groq', 'lib/server-groq.ts'],
    ['rewrite', 'app/api/rewrite/route.ts'],
    ['status', 'app/api/status/route.ts'],
  ]) {
    const source = readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
      .replace(/import ['"]server-only['"];?/, '')
      .replace(/(['"])cloudflare:workers\1/g, JSON.stringify(url('context')))
      .replace(/(['"])\.\.\/\.\.\/chatgpt-auth\1/g, JSON.stringify(url('auth')))
      .replace(/(['"])\.\.\/\.\.\/\.\.\/lib\/(rewriter|server-groq|features)\1/g, (_, _quote, dependency) => JSON.stringify(url(dependency)));
    writeFileSync(join(directory, `${name}.mjs`), js.replace(/(['"])\.\/(features|rewriter-grammar)\1/g,(_,quote,name)=>JSON.stringify(url(name))));
  }
  const { state } = await import(url('context'));
  const { POST } = await import(url('rewrite'));
  const { GET } = await import(url('status'));
  const limits = await import(url('server-groq'));
  const calls = [];
  let responder = async () => success();
  globalThis.fetch = async (...args) => { calls.push(args); return responder(...args); };
  return { state, POST, GET, calls, limits, respondWith(fn) { responder = fn; } };
}

function request(body = {}, options = {}) {
  return new Request('https://private-site.example/api/rewrite', {
    method: 'POST',
    headers: { origin: 'https://private-site.example', 'Content-Type': 'application/json', ...options.headers },
    body: JSON.stringify({ text: input, ...body }),
  });
}

function success() {
  return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
    style: { label: 'Business', features: ['Polite'], explanation: 'A brief work request.' },
    edits: [], protected_terms: [], note: '',
  }) } }] });
}

async function expectCode(response, status, code) {
  assert.equal(response.status, status);
  assert.equal((await response.json()).code, code);
  assert.equal(response.headers.get('cache-control'), 'no-store');
}

test('status exposes only a boolean and requires authentication', async () => {
  const f = await fixture(true);
  assert.deepEqual(await (await f.GET()).json(), { ownerKeyAvailable: false });
  f.state.env.GROQ_OWNER_API_KEY = ` ${ownerKey} `;
  const ready = await f.GET();
  assert.equal(ready.status, 200);
  assert.equal(ready.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await ready.json(), { ownerKeyAvailable: true });
  f.state.env.GROQ_OWNER_API_KEY = 'malformed';
  assert.deepEqual(await (await f.GET()).json(), { ownerKeyAvailable: false });
  f.state.env.GROQ_OWNER_API_KEY = ownerKey;
  f.state.user = null;
  const anonymous = await f.GET();
  assert.equal(anonymous.status, 401);
  assert.deepEqual(await anonymous.json(), { ownerKeyAvailable: false });
  assert.equal(f.calls.length, 0);
});

test('omitted keySource stays BYOK, even with an owner key configured', async () => {
  const f = await fixture(true);
  f.state.env.GROQ_OWNER_API_KEY = ownerKey;
  await expectCode(await f.POST(request()), 400, 'KEY_REQUIRED');
  await expectCode(await f.POST(request({ apiKey: 'not-a-groq-key' })), 400, 'KEY_FORMAT');
  assert.equal(f.calls.length, 0);
  const response = await f.POST(request({ apiKey: visitorKey }));
  assert.equal(response.status, 200);
  assert.equal(f.calls.length, 1);
  const [target, options] = f.calls[0];
  assert.equal(target, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(options.redirect, 'manual');
  assert.equal(options.headers.Authorization, `Bearer ${visitorKey}`);
  assert.ok(!options.body.includes(ownerKey));
  assert.ok(!options.body.includes(visitorKey));
  const payload = JSON.parse(options.body);
  assert.equal(payload.model, 'openai/gpt-oss-20b');
  assert.equal(payload.max_completion_tokens, 6000);
  const responseText = await response.text();
  assert.ok(!responseText.includes(ownerKey));
  assert.ok(!responseText.includes(visitorKey));
});

test('owner mode never uses a supplied visitor key when the owner binding is absent or invalid', async () => {
  const f = await fixture(true);
  await expectCode(await f.POST(request({ keySource: 'owner', apiKey: visitorKey })), 503, 'OWNER_KEY_UNAVAILABLE');
  f.state.env.GROQ_OWNER_API_KEY = 'malformed';
  await expectCode(await f.POST(request({ keySource: 'owner', apiKey: visitorKey })), 503, 'OWNER_KEY_UNAVAILABLE');
  assert.equal(f.calls.length, 0);
});

test('owner mode uses only the runtime owner key and applies a cooldown', async () => {
  const f = await fixture(true);
  f.state.env.GROQ_OWNER_API_KEY = ownerKey;
  const response = await f.POST(request({ keySource: 'owner', apiKey: visitorKey }));
  assert.equal(response.status, 200);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][1].headers.Authorization, `Bearer ${ownerKey}`);
  assert.ok(!f.calls[0][1].body.includes(visitorKey));
  const cooldown = await f.POST(request({ keySource: 'owner' }));
  assert.ok(Number(cooldown.headers.get('retry-after')) > 0);
  await expectCode(cooldown, 429, 'OWNER_RATE_LIMIT');
  assert.equal(f.calls.length, 1);
  // An owner cooldown does not silently change source or block BYOK.
  assert.equal((await f.POST(request({ keySource: 'byok', apiKey: visitorKey }))).status, 200);
  assert.equal(f.calls[1][1].headers.Authorization, `Bearer ${visitorKey}`);
});

test('invalid keySource is rejected without selecting or falling back to either key', async () => {
  const f = await fixture(true);
  f.state.env.GROQ_OWNER_API_KEY = ownerKey;
  for (const keySource of ['auto', '', null, false, {}, ['owner']]) {
    await expectCode(await f.POST(request({ keySource, apiKey: visitorKey })), 400, 'INVALID_KEY_SOURCE');
  }
  assert.equal(f.calls.length, 0);
});

test('authentication, origin, media type, body shape, and text limits run before fetch', async () => {
  const f = await fixture(true);
  f.state.user = null;
  await expectCode(await f.POST(request({ apiKey: visitorKey })), 401, 'AUTH_REQUIRED');
  f.state.user = { userId: 'test-user' };
  await expectCode(await f.POST(request({ apiKey: visitorKey }, { headers: { origin: 'https://other.example' } })), 403, 'ORIGIN_MISMATCH');
  await expectCode(await f.POST(request({ apiKey: visitorKey }, { headers: { origin: '' } })), 403, 'ORIGIN_MISMATCH');
  await expectCode(await f.POST(request({}, { headers: { 'Content-Type': 'text/plain' } })), 415, 'BAD_REQUEST');
  for (const body of ['null', '[]', '"text"', '{']) {
    await expectCode(await f.POST(new Request('https://private-site.example/api/rewrite', { method: 'POST', headers: { origin: 'https://private-site.example', 'Content-Type': 'application/json' }, body })), 400, 'BAD_REQUEST');
  }
  await expectCode(await f.POST(request({ text: '', apiKey: visitorKey })), 400, 'EMPTY');
  await expectCode(await f.POST(request({ text: 'x'.repeat(3001), apiKey: visitorKey })), 400, 'TOO_LONG');
  await expectCode(await f.POST(request({ padding: 'x'.repeat(24000), apiKey: visitorKey })), 413, 'TOO_LONG');
  await expectCode(await f.POST(request({ apiKey: visitorKey }, { headers: { 'Content-Length': '24001' } })), 413, 'TOO_LONG');
  assert.equal(f.calls.length, 0);
});

test('upstream errors never reveal credentials, retry, or fall back to another source', async () => {
  const f = await fixture(true);
  f.state.env.GROQ_OWNER_API_KEY = ownerKey;
  f.respondWith(async () => new Response(`secret: ${ownerKey}`, { status: 403 }));
  const denied = await f.POST(request({ keySource: 'owner', apiKey: visitorKey }));
  const deniedText = await denied.text();
  assert.equal(denied.status, 403);
  assert.equal(JSON.parse(deniedText).code, 'PROVIDER_AUTH');
  assert.ok(!deniedText.includes(ownerKey));
  assert.ok(!deniedText.includes(visitorKey));
  assert.equal(f.calls.length, 1);
  // The owner lock is released on errors; the counted attempt still has a cooldown.
  await expectCode(await f.POST(request({ keySource: 'owner' })), 429, 'OWNER_RATE_LIMIT');
  f.respondWith(async () => { throw new Error(visitorKey); });
  const failed = await f.POST(request({ keySource: 'byok', apiKey: visitorKey }));
  assert.equal(failed.status, 502);
  assert.ok(!(await failed.text()).includes(visitorKey));
  assert.equal(f.calls.length, 2);
  f.respondWith(async () => success());
  assert.equal((await f.POST(request({ keySource: 'byok', apiKey: visitorKey }))).status, 200);
});

test('per-user in-flight guard prevents simultaneous AI requests', async () => {
  const f = await fixture(true);
  let unblock;
  const blocked = new Promise(resolve => { unblock = resolve; });
  let started;
  const fetching = new Promise(resolve => { started = resolve; });
  f.respondWith(async () => { started(); await blocked; return success(); });
  const pending = f.POST(request({ apiKey: visitorKey }));
  await fetching;
  await expectCode(await f.POST(request({ apiKey: visitorKey })), 429, 'BUSY');
  unblock();
  assert.equal((await pending).status, 200);
  assert.equal(f.calls.length, 1);
});

test('owner limiter is one concurrent request, ten-second cooldown, thirty attempts per rolling hour', async () => {
  const { limits } = await fixture(true);
  const first = limits.reserveOwnerRequest(0);
  assert.equal(first.allowed, true);
  assert.equal(limits.reserveOwnerRequest(10_000).code, 'OWNER_BUSY');
  first.release();
  assert.deepEqual(limits.reserveOwnerRequest(9_999), { allowed: false, code: 'OWNER_RATE_LIMIT', retryAfter: 1 });
  const second = limits.reserveOwnerRequest(10_000);
  assert.equal(second.allowed, true);
  first.release(); // Releasing an old reservation again cannot unlock the new one.
  assert.equal(limits.reserveOwnerRequest(20_000).code, 'OWNER_BUSY');
  second.release();
  for (let attempt = 2; attempt < 30; attempt++) {
    const next = limits.reserveOwnerRequest(attempt * 10_000);
    assert.equal(next.allowed, true);
    next.release();
  }
  assert.deepEqual(limits.reserveOwnerRequest(300_000), { allowed: false, code: 'OWNER_RATE_LIMIT', retryAfter: 3300 });
  const nextHour = limits.reserveOwnerRequest(3_600_000);
  assert.equal(nextHour.allowed, true);
  nextHour.release();
});

test('server source retains server-only boundary and never logs credentials', () => {
  const helper = readFileSync(new URL('../lib/server-groq.ts', import.meta.url), 'utf8');
  assert.match(helper, /import 'server-only'/);
  assert.match(helper, /from 'cloudflare:workers'/);
  for (const path of ['lib/server-groq.ts', 'app/api/rewrite/route.ts', 'app/api/status/route.ts']) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /console\s*\./);
    assert.doesNotMatch(source, /NEXT_PUBLIC|localStorage|sessionStorage/);
  }
});


test('deployment flag hides and disables owner mode even with a configured secret', async () => {
  const source=readFileSync(new URL('../lib/features.ts',import.meta.url),'utf8');
  assert.match(source,/OWNER_KEY_MODE_ENABLED\s*=\s*false/);
  const f=await fixture();
  f.state.env.GROQ_OWNER_API_KEY=ownerKey;
  assert.equal(f.limits.getOwnerGroqApiKey(),undefined);
  assert.deepEqual(await (await f.GET()).json(),{ownerKeyAvailable:false});
  await expectCode(await f.POST(request({keySource:'owner',apiKey:visitorKey})),403,'OWNER_MODE_DISABLED');
  assert.equal(f.calls.length,0);
  const response=await f.POST(request({keySource:'byok',apiKey:visitorKey}));
  assert.equal(response.status,200);
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0][1].headers.Authorization,`Bearer ${visitorKey}`);
});

test('AI route enables context checks rather than accepting malformed phrase boundaries',async()=>{
  const f=await fixture();
  const source='朝の空気はひんやりしていて、歩いているうちに頭がすっきりしてきた。今日は少し早起きして公園へ出かけた。';
  f.respondWith(async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({style:{label:'日常',features:[],explanation:'入力の文体'},protected_terms:[],note:'',edits:[{original:'ひんやり',replacement:'冷たくて清々しい',occurrence:0},{original:'頭がすっきり',replacement:'頭が軽くなる',occurrence:0},{original:'早起き',replacement:'少し早めに起床',occurrence:0}]})}}]}));
  const response=await f.POST(request({apiKey:visitorKey,text:source}));assert.equal(response.status,200);const body=await response.json();assert.equal(body.rewritten,source);assert.equal(body.changedWords,0);assert.equal(body.selection.proposed,3);assert.equal(body.selection.rejected.grammar_join,2);assert.equal(body.selection.rejected.context_duplicate,1);assert.equal(f.calls.length,1);
});
