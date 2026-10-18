// Isolated local Workerd/D1 only. No auth mocks, real keys or provider network calls.
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname,relative,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const hasOverlay=existsSync(join(root,'overlay/lib/public-api-admission.ts'));
export const baseline=resolve(process.env.SCRAMBLER_BASELINE??(hasOverlay?join(root,'../style-rewriter-site'):root));
export const overlay=hasOverlay?join(root,'overlay'):root;
const diagnosticContract=join(existsSync(join(overlay,'lib/conversion-diagnostics.ts'))?overlay:baseline,'lib/conversion-diagnostics.ts');
export const diagnosticConsentVersion=readFileSync(diagnosticContract,'utf8').match(/DIAGNOSTIC_CONSENT_VERSION\s*=\s*['"]([^'"]+)/)[1];
export const sqlNow="(CAST(strftime('%s','now') AS INTEGER) * 1000)";
export const origin='https://fixture.example';
export const dummyKey='gsk_SYNTHETIC_ANONYMOUS_FIXTURE_ONLY_123456789';
export const sourceText='Please review the document before the meeting.';
export const rewriteBody=()=>({text:sourceText,apiKey:dummyKey,keySource:'byok'});
export const contactBody=()=>({email:'',subject:'Synthetic question',body:'Synthetic test contact.',consent:true,consentVersion:'2026-10-18.1',replyRequested:false,website:''});
export const issueBody=()=>({reportId:crypto.randomUUID(),conversionId:crypto.randomUUID(),version:'2026.10.18-r17',mode:'preset',language:'en',category:'grammar',includeText:false,original:null,rewritten:null,consent:true,consentVersion:'2026-10-18.2'});
export const errorBody=()=>({code:'TIMEOUT',stage:'provider_fetch',httpStatus:504,version:'2026.10.18-r17',requestId:crypto.randomUUID(),timestamp:new Date().toISOString()});
export const metricsBody=()=>({consent:true,metrics:{conversionId:crypto.randomUUID(),version:'2026.10.18-r17',consentVersion:diagnosticConsentVersion,mode:'preset',providerCategory:'none',language:'en',style:'business',totalWords:12,proposed:2,applied:1,changedWords:1,rejected:{},elapsedMs:100,providerMs:0,validationMs:20,status:'ok',stage:'complete'}});
export const limits={rewrite:[5,60],contact:[3,30],diagnostics:[30,300],error_reports:[10,60],issue_reports:[3,30]};
const entry=`
import {env} from 'cloudflare:workers';
import {POST as rewrite} from './app/api/rewrite/route';
import {POST as contact} from './app/api/contact/route';
import {POST as diagnostics} from './app/api/conversion-diagnostics/route';
import {POST as errors} from './app/api/error-reports/route';
import {POST as issues} from './app/api/issue-reports/route';
import {admitPublicApi,publicJsonRequestError} from './lib/public-api-admission';
const leases=new Map();
export default {async fetch(request){
 const path=new URL(request.url).pathname;
 // Test-only endpoints; these never exist in the production overlay.
 if(path==='/__state')return Response.json({parsed:globalThis.__sourceParses??0});
 if(path.startsWith('/__admit/')){
  const guard=publicJsonRequestError(request);if(guard)return Response.json(guard,{status:guard.status});
  const a=await admitPublicApi(env.DB,path.slice('/__admit/'.length));
  if(!a.allowed)return Response.json(a,{status:a.status});
  const handle=crypto.randomUUID();leases.set(handle,a);return Response.json({handle},{status:201});
 }
 if(path.startsWith('/__release/')){const a=leases.get(path.slice('/__release/'.length));await a?.release();return Response.json({ok:!!a});}
 if(path.startsWith('/__timeout/')){const a=leases.get(path.slice('/__timeout/'.length));return Response.json({timeout:await a?.providerTimeoutMs()??null});}
 const routes={'/api/rewrite':rewrite,'/api/contact':contact,'/api/conversion-diagnostics':diagnostics,'/api/error-reports':errors,'/api/issue-reports':issues};
 return routes[path]?routes[path](request):new Response(null,{status:404});
}};`;
const cache=new Map();
async function bundle(fault){
 if(cache.has(fault))return cache.get(fault);
 const result=await build({stdin:{contents:entry,resolveDir:overlay,loader:'ts'},bundle:true,platform:'neutral',format:'esm',target:'es2022',write:false,external:['cloudflare:workers'],plugins:[{name:'isolated-overlay',setup(b){
  b.onResolve({filter:/chatgpt-auth/},()=>{throw Error('Anonymous routes must not import auth.');});
  b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export {};',loader:'js'}));
  b.onResolve({filter:/^\./},args=>{
   const path=resolve(args.resolveDir,args.path);
   const rel=path.startsWith(overlay+'/')?relative(overlay,path):path.startsWith(baseline+'/')?relative(baseline,path):null;
   if(rel===null)return;
   for(const base of [overlay,baseline])for(const ext of ['', '.ts','.tsx','.js','.mjs']){const candidate=join(base,rel)+ext;if(existsSync(candidate))return{path:candidate};}
  });
  b.onLoad({filter:/\/rewriter\.ts$/},args=>({contents:readFileSync(args.path,'utf8').replace('export function validateInput(text: unknown): string {','export function validateInput(text: unknown): string { globalThis.__sourceParses=(globalThis.__sourceParses??0)+1;'),loader:'ts',resolveDir:dirname(args.path)}));
  if(fault)b.onResolve({filter:/^cloudflare:workers$/},args=>args.namespace==='fault'?{path:'cloudflare:workers',external:true}:{path:'env',namespace:'fault'});
  if(fault)b.onLoad({filter:/.*/,namespace:'fault'},()=>({contents:`
   import {env as actual} from 'cloudflare:workers';
   const mode=${JSON.stringify(fault)};
   let batches=0;
   const db={
    prepare(sql){
     if(mode==='lease-read-failure'&&sql.startsWith('SELECT active_lease_until'))return{bind(){return{all(){throw Error('SYNTHETIC_DB_DETAIL_MUST_NOT_ESCAPE');}}}};
     if(mode==='release-failure'&&sql.startsWith('UPDATE public_api_admissions'))return{bind(){return{run(){throw Error('SYNTHETIC_DB_DETAIL_MUST_NOT_ESCAPE');}}}};
     return actual.DB.prepare(sql);
    },
    async batch(statements){
     batches++;
     if(mode==='storage-never'&&batches>1)return new Promise(()=>{});
     if(mode==='throw')throw Error('SYNTHETIC_DB_DETAIL_MUST_NOT_ESCAPE');
     if(mode==='never')return new Promise(()=>{});
     const result=await actual.DB.batch(statements);
     if(mode==='uncertain'){delete result[1].meta.changes;return result;}
     if(mode==='wrong-receipt'){if(result[1].results[0])result[1].results[0].request_id=crypto.randomUUID();return result;}
     if(mode==='timeout-commit'){await new Promise(r=>setTimeout(r,3000));return result;}
     return result;
    }
   };
   export const env={...actual,DB:mode==='missing'?undefined:db};
  `,loader:'js'}));
 }}]});
 cache.set(fault,result.outputFiles[0].text);return result.outputFiles[0].text;
}
export async function fixture({fault='',migrate=true,workers=1,upstream,storagePath}={}){
 const script=await bundle(fault),calls=[];
 const worker=()=>({modules:true,script,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'anonymous-api-fixture'},outboundService:async request=>{
  const record={url:request.url,method:request.method,redirect:request.redirect,authorization:request.headers.get('authorization'),body:await request.text()};calls.push(record);
  if(upstream)return upstream(request,record);
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({style:{label:'Business',features:['Polite'],explanation:'Fixture only.'},edits:[],protected_terms:[],note:''})}}]});
 }});
 const mf=new Miniflare({cf:false,...(storagePath?{d1Persist:storagePath}:{}),...(workers===1?worker():{workers:[{name:'gateway',modules:true,script:`export default {fetch(request,env){return env['W'+(request.headers.get('x-fixture-worker')??'0')].fetch(request)}};`,compatibilityDate:'2026-05-15',serviceBindings:Object.fromEntries(Array.from({length:workers},(_,i)=>['W'+i,'worker'+i]))},...Array.from({length:workers},(_,i)=>({...worker(),name:'worker'+i}))]})});
 const db=await mf.getD1Database('DB',workers===1?undefined:'worker0');
 if(migrate){
  const journal=JSON.parse(readFileSync(join(baseline,'drizzle/meta/_journal.json'),'utf8'));
  for(const item of journal.entries.filter(item=>item.idx<=4))await applySql(db,readFileSync(join(baseline,`drizzle/${item.tag}.sql`),'utf8'));
  await applySql(db,readFileSync(join(overlay,'drizzle/0005_public_api_admissions.sql'),'utf8'));
  for(const item of journal.entries.filter(item=>item.idx>=6))await applySql(db,readFileSync(join(baseline,`drizzle/${item.tag}.sql`),'utf8'));
 }
 const fetchers=workers===1?[{fetch:(url,options)=>mf.dispatchFetch(url,options)}]:Array.from({length:workers},(_,i)=>({fetch:(url,options)=>mf.dispatchFetch(url,{...options,headers:{...options.headers,'x-fixture-worker':String(i)}})}));
 let next=0;
 const send=(path,value={},extra={})=>{const {method='POST',headers={},worker,...rest}=extra;return fetchers[worker??next++%workers].fetch(origin+path,{method,headers:{origin,'content-type':'application/json',...headers},...(method==='GET'?{}:{body:JSON.stringify(value)}),...rest});};
 return{mf,db,calls,send,close:()=>mf.dispose(),rows:async()=> (await db.prepare('SELECT * FROM public_api_admissions').all()).results,parsed:async()=>(await(await send('/__state',{}, {method:'GET',worker:0})).json()).parsed};
}
export async function applySql(db,source){for(const sql of source.split('--> statement-breakpoint').filter(sql=>sql.trim()))await db.prepare(sql).run();}
export async function seed(db,category,count,ageMs=120000,activeMs=null){
 const statements=Array.from({length:count},()=>db.prepare(`INSERT INTO public_api_admissions (request_id,route,created_at,active_lease_until) VALUES (?,?,${sqlNow}-?,${activeMs===null?'NULL':`${sqlNow}+?`})`).bind(crypto.randomUUID(),category,ageMs,...(activeMs===null?[]:[activeMs])));
 for(let i=0;i<statements.length;i+=100)await db.batch(statements.slice(i,i+100));
}
