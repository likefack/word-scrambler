// Native Workerd fetch, intercepted only at its outbound service boundary.
// No network, real credentials, production identity, or provider inference.
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
const route=fileURLToPath(new URL('../app/api/rewrite/route.ts',import.meta.url));
const built=await build({stdin:{contents:`import {POST} from ${JSON.stringify(route)}; export default {fetch:POST};`,resolveDir:process.cwd(),sourcefile:'runtime-fixture.ts'},bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022',external:['cloudflare:workers'],plugins:[{name:'test-auth-only',setup(b){b.onResolve({filter:/chatgpt-auth$/},()=>({path:'fixture-auth',namespace:'fixture'}));b.onResolve({filter:/^server-only$/},()=>({path:'fixture-server-only',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='fixture-auth'?'export async function getChatGPTUser(){return {userId:"isolated-test-user"};}':'export {};',loader:'js'}));}}]});
const dummy='gsk_native_workerd_fixture_not_a_real_key';
const input='Please review the document before the meeting.';
const calls=[];
let upstreamStatus=200;
const mf=new Miniflare({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],outboundService:async request=>{
 calls.push({url:request.url,method:request.method,redirect:request.redirect,authorization:request.headers.get('authorization'),body:await request.text()});
 if(upstreamStatus>=300&&upstreamStatus<400)return new Response(null,{status:upstreamStatus,headers:{Location:'https://untrusted.invalid/must-never-be-followed'}});
 if(upstreamStatus!==200)return Response.json({error:{message:'fixture'}},{status:upstreamStatus});
 return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({style:{label:'Business',features:['Polite'],explanation:'Fixture only.'},edits:[],protected_terms:[],note:''})}}]});
}});
after(()=>mf.dispose());
for(const [status,expected,code] of [[200,200,null],[401,401,'PROVIDER_AUTH'],[429,429,'RATE_LIMIT'],[301,502,'PROVIDER_REDIRECT_BLOCKED'],[302,502,'PROVIDER_REDIRECT_BLOCKED'],[307,502,'PROVIDER_REDIRECT_BLOCKED'],[308,502,'PROVIDER_REDIRECT_BLOCKED']]){
 test(`native fetch accepts options; upstream ${status} returns ${expected} without redirecting`,async()=>{
 upstreamStatus=status;calls.length=0;
 const response=await mf.dispatchFetch('https://fixture.example/api/rewrite',{method:'POST',headers:{Origin:'https://fixture.example','Content-Type':'application/json'},body:JSON.stringify({text:input,apiKey:dummy,keySource:'byok'})});
 assert.equal(response.status,expected);const body=await response.json();if(code)assert.equal(body.code,code);else assert.equal(body.original,input);
 assert.equal(calls.length,1,'No redirect or retry may make a second provider request');
 assert.equal(calls[0].url,'https://api.groq.com/openai/v1/chat/completions');assert.equal(calls[0].authorization,`Bearer ${dummy}`);assert.ok(!calls[0].body.includes(dummy));assert.ok(!JSON.stringify(body).includes(dummy));
 });
}
test('source explicitly blocks every redirect before reading any Location',()=>{const source=readFileSync(route,'utf8');assert.match(source,/redirect:'manual'/);assert.match(source,/response.status>=300&&response.status<400/);assert.doesNotMatch(source,/headers.get\(['"]location/i);});
