import { admissionFixtureModule } from './helpers/admission-fixture.mjs';
// Source-level tests only: authentication, runtime bindings, and fetch are mocked.
// These tests never contact Groq, configure hosted secrets, or use real keys.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
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
    ...readdirSync(new URL('../lib/',import.meta.url)).filter(name=>name.endsWith('.ts')&&!name.startsWith('client-')&&name!=='features.ts').map(name=>[name.slice(0,-3),'lib/'+name]),
    ['rewrite', 'app/api/rewrite/route.ts'],
    ['status', 'app/api/status/route.ts'],
  ]) {
    const source = readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
      .replace(/import ['"]server-only['"];?/, '')
      .replace(/(['"])cloudflare:workers\1/g, JSON.stringify(url('context')))
      .replace(/(['"])\.\.\/\.\.\/chatgpt-auth\1/g, JSON.stringify(url('auth')))
      .replace(/(['"])\.\.\/\.\.\/\.\.\/lib\/([a-z-]+)\1/g, (_, _quote, dependency) => JSON.stringify(url(dependency)));
    writeFileSync(join(directory, `${name}.mjs`), js.replace(/(['"])\.\/([a-z-]+)\1/g,(_,quote,name)=>JSON.stringify(url(name))));
  }
  writeFileSync(join(directory,'public-api-admission.mjs'),admissionFixtureModule(readFileSync(new URL('../lib/public-api-admission.ts',import.meta.url),'utf8')));
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

// Former per-isolate/auth case is superseded by public-api-admission.test.mjs,
// which uses independent Workerd instances and real shared D1 transactions.

// Former per-isolate/auth case is superseded by public-api-admission.test.mjs,
// which uses independent Workerd instances and real shared D1 transactions.

test('invalid keySource is rejected without selecting or falling back to either key', async () => {
  const f = await fixture(true);
  f.state.env.GROQ_OWNER_API_KEY = ownerKey;
  for (const keySource of ['auto', '', null, false, {}, ['owner']]) {
    await expectCode(await f.POST(request({ keySource, apiKey: visitorKey })), 400, 'INVALID_KEY_SOURCE');
  }
  assert.equal(f.calls.length, 0);
});

test('anonymous origin, media type, body shape, and text limits run before fetch', async () => {
  const f = await fixture(true);
  f.state.user = null;
  f.state.user = { userId: 'test-user' };
  await expectCode(await f.POST(request({ apiKey: visitorKey }, { headers: { origin: 'https://other.example' } })), 403, 'ORIGIN_MISMATCH');
  await expectCode(await f.POST(request({ apiKey: visitorKey }, { headers: { origin: '' } })), 403, 'ORIGIN_MISMATCH');
  await expectCode(await f.POST(request({}, { headers: { 'Content-Type': 'text/plain' } })), 415, 'JSON_REQUIRED');
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
  const denied = await f.POST(request({ keySource: 'byok', apiKey: visitorKey }));
  const deniedText = await denied.text();
  assert.equal(denied.status, 403);
  assert.equal(JSON.parse(deniedText).code, 'PROVIDER_AUTH');
  assert.ok(!deniedText.includes(ownerKey));
  assert.ok(!deniedText.includes(visitorKey));
  assert.equal(f.calls.length, 1);
  f.respondWith(async () => { throw new Error(visitorKey); });
  const failed = await f.POST(request({ keySource: 'byok', apiKey: visitorKey }));
  assert.equal(failed.status, 502);
  assert.ok(!(await failed.text()).includes(visitorKey));
  assert.equal(f.calls.length, 2);
  f.respondWith(async () => success());
  assert.equal((await f.POST(request({ keySource: 'byok', apiKey: visitorKey }))).status, 200);
});

// Former per-isolate/auth case is superseded by public-api-admission.test.mjs,
// which uses independent Workerd instances and real shared D1 transactions.

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

test('JSON-object compatibility request preserves complex source data and uses one provider call',async()=>{
 const sources=[
  '## 作業一覧\n1. 公開した資料を確認する。\n2. 未完了の課題を整理する。\n3. 実験の条件を記録する。\n4. 問い合わせ内容を確認する。\n5. 改善結果を報告する。',
  '「彼は『この記号 \\" とバックスラッシュ \\\\ を残す』と話した。」という引用を読み、私は説明文を確認しました。',
  '担当者：資料を確認しましたか。\n回答者：はい、内容はまだ変更していません。\n担当者：では、結果を明日の会議で説明してください。',
  '# Update\nThe review is complete. 次の会議では結果を説明します。\n- Status: pending\n- 処理件数: 12\nPlease keep this table unchanged.',
  'This paragraph contains "quotes", a path C:\\project\\file, and multiple lines.\nThe original source remains intact.\n\nThe next paragraph explains the work.',
  '今日の作業内容を整理し、確認が必要な点を記録します。\n'.repeat(50),
  '🙂か\u3099くせいの文章を確認し、Cafe\u0301という表記を保ちながら説明を読みます。'
 ];
 for(const source of sources){const f=await fixture();const response=await f.POST(request({text:source,apiKey:visitorKey}));assert.equal(response.status,200);const data=await response.json();assert.equal(data.original,source);assert.equal(data.rewritten,source);assert.equal(f.calls.length,1);const sent=JSON.parse(f.calls[0][1].body);assert.deepEqual(sent.response_format,{type:'json_object'});assert(sent.messages[0].content.includes('JSON'));assert(sent.messages[0].content.includes('additionalProperties'));assert(sent.messages[1].content.endsWith(JSON.stringify(source)));assert(!JSON.stringify(sent).includes(visitorKey));}
});
test('JSON syntax alone never counts as a successful model response: closed local schema remains enforced',async()=>{
 const good={style:{label:'Plain',features:[],explanation:''},edits:[],protected_terms:[],note:''};
 const invalid=[null,[],{}, {...good,style:{}},{...good,note:null},{...good,edits:'none'},{...good,protected_terms:[42]},{...good,style:{...good.style,features:[{}]}},{...good,extra:'unexpected'}, {...good,edits:[{original:'review',replacement:'check',occurrence:'0'}]}, {...good,edits:[{original:'review',replacement:'check',occurrence:0,extra:'hidden'}]}, {...good,edits:[{original:'x'.repeat(161),replacement:'x',occurrence:0}]}, {...good,edits:Array.from({length:81},()=>({original:'review',replacement:'check',occurrence:0}))}];
 const f=await fixture();for(const bad of invalid){f.respondWith(async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(bad)}}]}));const response=await f.POST(request({apiKey:visitorKey}));assert.equal(response.status,502);const data=await response.json();assert.equal(data.code,'OUTPUT_SCHEMA_INVALID');assert(!('rewritten'in data));}
 f.respondWith(async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'```json\n{}\n```'}}]}));await expectCode(await f.POST(request({apiKey:visitorKey})),502,'CONTENT_NON_JSON');
});
test('provider schema failure is not converted to success and does not silently retry or recommend shortening',async()=>{
 const f=await fixture();f.respondWith(async()=>Response.json({error:{code:'json_validate_failed',type:'invalid_request_error',message:'private upstream message',failed_generation:JSON.stringify({edits:[]})}},{status:400}));
 const response=await f.POST(request({apiKey:visitorKey}));assert.equal(response.status,502);const data=await response.json();assert.equal(data.code,'PROVIDER_SCHEMA_VALIDATION');assert.equal(f.calls.length,1);assert(!('rewritten'in data));assert(!JSON.stringify(data).includes('private upstream'));assert(!JSON.stringify(data).includes('failed_generation'));assert(!data.error.includes('短く'));assert(!data.error.includes('時間を空け'));
});

test('public owner requests stay disabled even if retained feature code is enabled',async()=>{const f=await fixture(true);f.state.env.GROQ_OWNER_API_KEY=ownerKey;await expectCode(await f.POST(request({keySource:'owner',apiKey:visitorKey})),403,'OWNER_MODE_DISABLED');assert.equal(f.calls.length,0);});
