// Actual Workerd request streams/timers; no production auth, external network, or keys.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {Miniflare} from 'miniflare';
const route=fileURLToPath(new URL('../app/api/rewrite/route.ts',import.meta.url));
const built=await build({stdin:{contents:`import {POST} from ${JSON.stringify(route)};export default {fetch:POST};`,resolveDir:process.cwd(),sourcefile:'runtime-hardening-fixture.ts'},bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022',external:['cloudflare:workers'],plugins:[{name:'isolated-auth-only',setup(b){b.onResolve({filter:/chatgpt-auth$/},()=>({path:'auth',namespace:'fixture'}));b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='auth'?'export async function getChatGPTUser(){return {userId:"isolated-runtime-user"};}':'export {};',loader:'js'}));}}]});
let externalCalls=0;
const mf=new Miniflare({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],outboundService:()=>{externalCalls++;throw Error('External network forbidden');}});
after(()=>mf.dispose());
const options=body=>({method:'POST',headers:{origin:'https://fixture.example','content-type':'application/json'},body,duplex:'half'});
test('native Workerd rejects oversized streamed input before provider access',async()=>{const response=await mf.dispatchFetch('https://fixture.example/api/rewrite',options(new ReadableStream({start(c){c.enqueue(new Uint8Array(24001));c.close();}})));assert.equal(response.status,413);assert.equal((await response.json()).code,'TOO_LONG');assert.equal(externalCalls,0);});
test('native Workerd body read has an actual ten-second bound', {timeout:18000},async()=>{const started=Date.now();let controller;const body=new ReadableStream({start(c){controller=c;c.enqueue(new TextEncoder().encode('{'));}});try{const response=await mf.dispatchFetch('https://fixture.example/api/rewrite',options(body));assert.equal(response.status,408);const result=await response.json();assert.equal(result.code,'TIMEOUT');assert.equal(result.diagnostic.stage,'request_body');assert(Date.now()-started>=9000);assert(Date.now()-started<16000);assert.equal(externalCalls,0);}finally{try{controller.close();}catch{}}});
