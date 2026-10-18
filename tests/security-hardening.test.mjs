import { admissionFixturePlugin } from './helpers/admission-fixture.mjs';
// Synthetic secrets only; every provider request is intercepted before network I/O.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(new URL('..',import.meta.url).pathname),temp=mkdtempSync(join(tmpdir(),'scrambler-hardening-'));
const originalFetch=globalThis.fetch,originalTimer=globalThis.setTimeout;
const secret='gsk_SECURITY_FIXTURE_ONLY_NOT_A_REAL_KEY',input='Please review the document before the meeting.';
after(()=>{globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimer;rmSync(temp,{recursive:true,force:true});});
let sequence=0;
const success=()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({style:{label:'Business',features:[],explanation:''},edits:[],protected_terms:[],note:''})}}]});
async function fixture(){
 const statePath=join(temp,`state-${sequence++}.mjs`);writeFileSync(statePath,'export const state={user:{userId:"fixture-user"},env:{}};export const env=state.env;export async function getChatGPTUser(){return state.user;}');
 const output=await build({entryPoints:[join(root,'app/api/rewrite/route.ts')],bundle:true,write:false,format:'esm',platform:'node',target:'es2022',plugins:[admissionFixturePlugin(root),{name:'isolated-boundaries',setup(b){b.onResolve({filter:/chatgpt-auth$|^cloudflare:workers$/},()=>({path:statePath,external:true}));b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export {};'}));}}]});
 const routePath=join(temp,`route-${sequence}.mjs`);writeFileSync(routePath,output.outputFiles[0].text);const route=await import(pathToFileURL(routePath)),{state}=await import(pathToFileURL(statePath));
 const calls=[];let responder=success;globalThis.fetch=async(...args)=>{calls.push(args);return responder(...args);};return{...route,state,calls,respondWith(value){responder=value;}};
}
const request=(body,options={})=>new Request('https://fixture.example/api/rewrite',{method:'POST',headers:{origin:'https://fixture.example','content-type':'application/json'},body:body??JSON.stringify({text:input,apiKey:secret}),...options});
for(const encoding of ['literal','envelope-escaped','content-escaped'])test(`provider cannot reflect a ${encoding} key in results`,async()=>{
 const f=await fixture(),escaped=[...secret].map(c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
 let content=JSON.stringify({style:{label:'Business',features:[],explanation:secret},edits:[],protected_terms:[],note:''});if(encoding==='content-escaped')content=content.replace(secret,escaped);
 let body=JSON.stringify({choices:[{finish_reason:'stop',message:{content}}]});if(encoding==='envelope-escaped')body=body.replace(secret,escaped);f.respondWith(()=>new Response(body,{headers:{'content-type':'application/json'}}));
 const response=await f.POST(request());assert.equal(response.status,502);const returned=await response.text();assert(!returned.includes(secret));assert.match(returned,/SENSITIVE_OUTPUT_BLOCKED|PROVIDER_ENVELOPE_INVALID/);
});
test('provider response byte cap never returns its contents',async()=>{
 const f=await fixture();let cancelled=false;f.respondWith(()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(secret+'x'.repeat(262145)));},cancel(){cancelled=true;}})));
 const response=await f.POST(request());assert.equal(response.status,502);const body=await response.text();assert.match(body,/PROVIDER_RESPONSE_TOO_LARGE/);assert(!body.includes(secret));assert(cancelled);
});
test('body timeout does not await producer cancellation',async()=>{
 const f=await fixture();globalThis.setTimeout=(fn,delay,...args)=>originalTimer(fn,delay===10000?20:delay,...args);let cancelled=false;
 try{const stream=new ReadableStream({cancel(){cancelled=true;return new Promise(()=>{});}});const response=await Promise.race([f.POST(request(stream,{duplex:'half'})),new Promise((_,reject)=>originalTimer(()=>reject(Error('body timeout stalled')),1000))]);
 assert.equal(response.status,408);const body=await response.json();assert.equal(body.code,'TIMEOUT');assert.equal(body.diagnostic.stage,'request_body');assert(cancelled);assert.equal(f.calls.length,0);}finally{globalThis.setTimeout=originalTimer;}
});
test('oversized request does not wait for cancellation acknowledgement',async()=>{
 const f=await fixture();const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(24001));},cancel(){return new Promise(()=>{});}});
 const response=await Promise.race([f.POST(request(stream,{duplex:'half'})),new Promise((_,reject)=>originalTimer(()=>reject(Error('cancellation stalled')),1000))]);assert.equal(response.status,413);assert.equal(f.calls.length,0);
});
test('concurrent users never share visitor keys or content',async()=>{
 const f=await fixture(),secondKey='gsk_SECOND_FIXTURE_KEY_NOT_A_REAL_SECRET';let release,notify;const started=new Promise(resolve=>{notify=resolve;}),blocked=new Promise(resolve=>{release=resolve;});f.respondWith(async()=>{notify();await blocked;return success();});
 const first=f.POST(request());await started;f.state.user={userId:'other-fixture-user'};const secondText='Another user has a completely separate sentence.';const second=f.POST(request(JSON.stringify({text:secondText,apiKey:secondKey})));await new Promise(resolve=>originalTimer(resolve,10));assert.equal(f.calls.length,2);release();
 const values=await Promise.all((await Promise.all([first,second])).map(response=>response.json()));assert.equal(values[0].original,input);assert.equal(values[1].original,secondText);assert.equal(f.calls[0][1].headers.Authorization,`Bearer ${secret}`);assert.equal(f.calls[1][1].headers.Authorization,`Bearer ${secondKey}`);assert(!JSON.stringify(values).includes(secret));assert(!JSON.stringify(values).includes(secondKey));
});
