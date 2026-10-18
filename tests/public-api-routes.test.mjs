import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture,seed,sqlNow,baseline,overlay,hasOverlay,rewriteBody,contactBody,metricsBody,errorBody,issueBody,dummyKey,sourceText} from './fixture.mjs';
const routeInputs=[['rewrite',rewriteBody,200],['contact',contactBody,201],['conversion-diagnostics',metricsBody,200],['error-reports',errorBody,200],['issue-reports',issueBody,201]];
const extra=route=>route==='error-reports'?{headers:{'x-report-id':crypto.randomUUID()}}:{};

for(const [route,input,status] of routeInputs){
 test(`${route}: anonymous POST succeeds without cookies/auth and GET/Origin/JSON boundaries remain`,async()=>{
  const f=await fixture();try{
   for(const [settings,expected] of [[{method:'GET'},405],[{headers:{origin:''}},403],[{headers:{origin:'https://other.example'}},403],[{headers:{'content-type':'application/jsonp'}},415],[{headers:{'content-type':'text/plain'}},415],[{headers:{'content-encoding':'gzip'}},415]]){
    const response=await f.send('/api/'+route,input(),settings);assert.equal(response.status,expected);assert.equal((await f.rows()).length,0);assert.equal(f.calls.length,0);
   }
   const response=await f.send('/api/'+route,input(),extra(route));assert.equal(response.status,status,await response.clone().text());
   assert.equal((await f.rows()).length,1);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
   assert.equal(f.calls.length,route==='rewrite'?1:0);
  }finally{await f.close();}
 });
}

test('anonymous BYOK makes exactly one fixed Groq call; key/text/headers never enter admission storage',async()=>{
 const f=await fixture();try{
  const response=await f.send('/api/rewrite',rewriteBody(),{headers:{'x-client-secret':'fixture-header-not-for-storage','cf-connecting-ip':'192.0.2.5','user-agent':'fixture-browser'}});
  assert.equal(response.status,200);const data=await response.json();assert.equal(data.original,sourceText);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,'https://api.groq.com/openai/v1/chat/completions');assert.equal(f.calls[0].authorization,'Bearer '+dummyKey);assert.equal(f.calls[0].method,'POST');assert(!f.calls[0].body.includes(dummyKey));
  assert.equal(await f.parsed(),1);
  const rows=await f.rows();assert.equal(rows.length,1);assert.equal(rows[0].active_lease_until,null);
  const persisted=JSON.stringify(rows);for(const forbidden of [dummyKey,sourceText,'fixture-header-not-for-storage','192.0.2.5','fixture-browser','user_id','hash'])assert(!persisted.includes(forbidden));
  assert(!JSON.stringify(data).includes(dummyKey));
  for(const table of ['conversion_diagnostics','contact_submissions','text_issue_reports','diagnostic_text_reports','error_reports','contact_mail_outbox','contact_mail_nonces'])assert.equal((await f.db.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n,0);
 }finally{await f.close();}
});

test('owner mode rejected before D1 admission/source parser/provider even with valid BYOK supplied',async()=>{
 const f=await fixture();try{
  const r=await f.send('/api/rewrite',{...rewriteBody(),keySource:'owner',diagnosticsConsent:true,diagnosticsConsentVersion:'2026-10-18.1'});
  assert.equal(r.status,403);assert.equal((await r.json()).code,'OWNER_MODE_DISABLED');assert.equal((await f.rows()).length,0);assert.equal(f.calls.length,0);assert.equal(await f.parsed(),0);
  assert.equal((await f.db.prepare('SELECT count(*) AS n FROM conversion_diagnostics').first()).n,0);
 }finally{await f.close();}
});

test('real rewrite route admits only two concurrent provider requests and releases both in finally',async()=>{
 const pending=[];const f=await fixture({workers:2,upstream:()=>new Promise(resolve=>pending.push(resolve))});try{
  const requests=Array.from({length:14},()=>f.send('/api/rewrite',rewriteBody()));
  const until=Date.now()+5000;while(pending.length<2&&Date.now()<until)await new Promise(r=>setTimeout(r,10));
  assert.equal(pending.length,2);assert.equal((await f.rows()).filter(r=>r.active_lease_until!==null).length,2);
  for(const done of pending)done(Response.json({error:{message:'synthetic unavailable'}},{status:503}));
  const responses=await Promise.all(requests);assert.equal(responses.filter(r=>r.status===502).length,2);assert.equal(responses.filter(r=>r.status===429).length,12);assert.equal(f.calls.length,2);
  const rows=await f.rows();assert.equal(rows.length,2);assert(rows.every(r=>r.active_lease_until===null));
 }finally{for(const done of pending)done(new Response(null,{status:503}));await f.close();}
});

for(const fault of ['missing','throw','never','uncertain','wrong-receipt','timeout-commit']){
 test(`rewrite fail-closed on ${fault}: no source parser, provider call or fallback`,async()=>{
  const f=await fixture({fault});try{
   const start=Date.now(),r=await f.send('/api/rewrite',rewriteBody());assert.equal(r.status,503);assert(Date.now()-start<4500);
   const data=await r.json();assert.equal(data.code,'PUBLIC_ADMISSION_UNAVAILABLE');assert(!JSON.stringify(data).includes('SYNTHETIC_DB_DETAIL'));assert(!JSON.stringify(data).includes(dummyKey));assert.equal(f.calls.length,0);assert.equal(await f.parsed(),0);
   const rows=await f.rows();assert.equal(rows.length,['uncertain','wrong-receipt','timeout-commit'].includes(fault)?1:0);
   if(rows.length)assert(rows[0].active_lease_until!==null,'An uncertain commit must retain its lease, with no retry/delete fallback.');
  }finally{await f.close();}
 });
}

test('missing migration fails closed and cannot cause a provider call',async()=>{
 const f=await fixture({migrate:false});try{const r=await f.send('/api/rewrite',rewriteBody());assert.equal(r.status,503);assert.equal(f.calls.length,0);assert.equal(await f.parsed(),0);}finally{await f.close();}
});

test('lease recheck failure after parser blocks provider; release failure is safe through auto-expiry',async()=>{
 for(const fault of ['lease-read-failure','release-failure']){
  const f=await fixture({fault});try{
   const r=await f.send('/api/rewrite',rewriteBody());assert.equal(r.status,fault==='lease-read-failure'?503:200);
   assert.equal(await f.parsed(),1);assert.equal(f.calls.length,fault==='lease-read-failure'?0:1);
   const row=(await f.rows())[0];assert.equal(row.active_lease_until===null,fault==='lease-read-failure');
   if(fault==='release-failure')assert(row.active_lease_until-row.created_at<=90000);
  }finally{await f.close();}
 }
});

test('provider redirect remains blocked without retry/follow, and provider failure releases slot',async()=>{
 const f=await fixture({upstream:()=>new Response(null,{status:307,headers:{Location:'https://untrusted.invalid'}})});try{
  const r=await f.send('/api/rewrite',rewriteBody());assert.equal(r.status,502);assert.equal((await r.json()).code,'PROVIDER_REDIRECT_BLOCKED');assert.equal(f.calls.length,1);assert.equal((await f.rows())[0].active_lease_until,null);
 }finally{await f.close();}
});

test('admission denial wins over malformed source and invalid later input still consumes attempt',async()=>{
 const f=await fixture();try{
  const r=await f.send('/api/rewrite',{...rewriteBody(),text:null});assert.equal(r.status,400);assert.equal((await f.rows()).length,1);assert.equal((await f.rows())[0].active_lease_until,null);
  await seed(f.db,'rewrite',59);
  const denied=await f.send('/api/rewrite',{...rewriteBody(),text:null});assert.equal(denied.status,429);assert.equal(await f.parsed(),1);assert.equal(f.calls.length,0);
 }finally{await f.close();}
});

test('all intake routes fail closed before their body validation on uncertain DB',async()=>{
 for(const route of ['contact','conversion-diagnostics','error-reports','issue-reports']){
  const f=await fixture({fault:'throw'});try{
   const r=await f.send('/api/'+route,{}, {...extra(route),body:'malformed-json'});assert.equal(r.status,503);assert.equal(f.calls.length,0);assert.equal((await f.rows()).length,0);
  }finally{await f.close();}
 }
});

test('bounded request bodies and intake secret/unknown-field guards remain enforced',async()=>{
 const f=await fixture();try{
  assert.equal((await f.send('/api/rewrite',{...rewriteBody(),text:'x'.repeat(25000)})).status,413);assert.equal(f.calls.length,0);
  assert.equal((await f.send('/api/contact',{...contactBody(),body:dummyKey})).status,400);
  assert.equal((await f.send('/api/contact',{...contactBody(),arbitraryRecipient:'person@example.invalid'})).status,400);
  assert.equal((await f.send('/api/issue-reports',{...issueBody(),includeText:true,original:dummyKey,rewritten:'replacement'})).status,400);
  assert.equal((await f.send('/api/conversion-diagnostics',{...metricsBody(),body:sourceText})).status,400);
  assert.equal((await f.send('/api/error-reports',{...errorBody(),body:sourceText},extra('error-reports'))).status,400);
  for(const table of ['contact_submissions','text_issue_reports','diagnostic_text_reports','conversion_diagnostics','error_reports'])assert.equal((await f.db.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n,0);
  assert(!JSON.stringify(await f.rows()).includes(dummyKey));
 }finally{await f.close();}
});

test('minute/history survive worker restart using persisted local D1',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'anonymous-admission-'));let f;
 try{
  f=await fixture({storagePath:dir});await seed(f.db,'rewrite',60);await f.close();
  f=await fixture({storagePath:dir,migrate:false});const r=await f.send('/api/rewrite',rewriteBody());assert.equal(r.status,429);assert.equal(f.calls.length,0);assert.equal((await f.rows()).length,60);
 }finally{await f?.close();rmSync(dir,{recursive:true,force:true});}
});

test('scope: no public reader, contact auth removed, status auth and contact-mail untouched',()=>{
 if(hasOverlay){assert(!existsSync(join(overlay,'app/api/status/route.ts')));assert(!existsSync(join(overlay,'app/api/contact-mail/route.ts')));}
 assert.match(readFileSync(join(baseline,'app/api/status/route.ts'),'utf8'),/getChatGPTUser/);
 assert(!readFileSync(join(overlay,'app/contact/page.tsx'),'utf8').includes('requireChatGPTUser'));
 for(const [route] of routeInputs){const source=readFileSync(join(overlay,`app/api/${route}/route.ts`),'utf8');assert(!source.includes('getChatGPTUser'));assert(!/export (?:async )?function (GET|DELETE|PUT|PATCH)/.test(source));}
});


test('post-admission contact/error storage timeout fails closed with no false success receipt',async()=>{
 for(const [route,input] of [['contact',contactBody],['error-reports',errorBody]]){
  const f=await fixture({fault:'storage-never'});try{
   const before=Date.now(),r=await f.send('/api/'+route,input(),extra(route));assert.equal(r.status,503);assert(Date.now()-before<4500);
   const data=await r.json();assert(!data.submissionId);assert(!data.reportId);assert.equal((await f.rows()).length,1);assert.equal(f.calls.length,0);
  }finally{await f.close();}
 }
});
test('diagnostic attachment uses the same durable anonymous admission and a separate consent-gated text table',async()=>{
 const f=await fixture();try{
  const good={...issueBody(),category:'other',includeText:true,original:'Edited synthetic source.',rewritten:'Edited synthetic result.',consentVersion:'2026-10-18.4',diagnosticsEnabled:true};
  for(const delta of [{diagnosticsEnabled:false},{consent:false}]){assert.equal((await f.send('/api/issue-reports',{...good,...delta})).status,400);assert.equal((await f.db.prepare('SELECT count(*) n FROM diagnostic_text_reports').first()).n,0);}
  assert.equal((await f.send('/api/issue-reports',good)).status,201);assert.equal((await f.send('/api/issue-reports',{...good,reportId:crypto.randomUUID()})).status,429);
  const rows=await f.rows();assert.equal(rows.length,3);assert(!JSON.stringify(rows).includes(good.original));assert(!JSON.stringify(rows).includes(good.rewritten));const saved=await f.db.prepare('SELECT * FROM diagnostic_text_reports').first();assert.equal(saved.original_text,good.original);assert.equal(saved.consent_version,'2026-10-18.4');for(const table of ['text_issue_reports','conversion_diagnostics','contact_submissions','contact_mail_outbox'])assert.equal((await f.db.prepare(`SELECT count(*) n FROM ${table}`).first()).n,0);assert.equal(f.calls.length,0);
 }finally{await f.close();}
});
