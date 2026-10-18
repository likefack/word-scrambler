import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fixture,seed,rewriteBody,overlay,baseline,contactBody,issueBody,metricsBody} from './fixture.mjs';
import {join,resolve} from 'node:path';
import {existsSync,readFileSync} from 'node:fs';
const source=`export * from './lib/error-reports';export * from './lib/public-api-messages';export * from './lib/contact-intake';export * from './lib/issue-reports';export * from './lib/conversion-diagnostics';`;
const result=await build({stdin:{contents:source,resolveDir:overlay,loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'baseline-fallback',setup(b){b.onResolve({filter:/^\./},a=>{const path=resolve(a.resolveDir,a.path);if(path.startsWith(overlay+'/')&&!existsSync(path+'.ts')){const p=path.replace(overlay,baseline)+'.ts';if(existsSync(p))return{path:p};}});}}]});
const contract=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));

test('fixed PUBLIC codes and admission stage survive browser diagnostic projection and report storage',async()=>{
 const f=await fixture();try{
  await seed(f.db,'rewrite',60);const r=await f.send('/api/rewrite',rewriteBody());const data=await r.json();assert.equal(r.status,429);
  assert.equal(data.diagnostic.stage,'admission');const projected=contract.projectErrorReportDiagnostic(data.diagnostic);assert.equal(projected.code,'PUBLIC_RATE_LIMIT');
  const stored=await f.send('/api/error-reports',projected,{headers:{'x-report-id':crypto.randomUUID()}});assert.equal(stored.status,200);
  for(const code of ['PUBLIC_RATE_LIMIT','PUBLIC_ADMISSION_UNAVAILABLE','METHOD_NOT_ALLOWED','JSON_REQUIRED'])assert.equal(contract.projectErrorReportDiagnostic({...data.diagnostic,code}).code,code);
  assert.equal(contract.projectErrorReportDiagnostic({...data.diagnostic,stage:'arbitrary-user-stage'}),null);
  assert.equal(contract.projectErrorReportDiagnostic({...data.diagnostic,code:'UNREVIEWED_UPSTREAM_ERROR'}),null);
  assert.equal(contract.projectErrorReportDiagnostic({...data.diagnostic,code:'secret gsk_synthetic'}),null);
  assert(!readFileSync(join(overlay,'lib/public-api-admission.ts'),'utf8').includes('console.'));
 }finally{await f.close();}
});

test('fixed Japanese public messages do not echo unknown data or ask for login',()=>{
 for(const code of ['PUBLIC_RATE_LIMIT','PUBLIC_ADMISSION_UNAVAILABLE','AUTH_REQUIRED']){
  assert.equal(typeof contract.publicApiErrorMessage(code),'string');assert(!contract.publicApiErrorMessage(code).includes('サインイン'));
  assert(!contract.contactErrorMessage(code).includes('サインイン'));assert(!contract.issueErrorMessage(code).includes('サインイン'));
 }
 assert.equal(contract.publicApiErrorMessage('gsk_unknown_error'),null);
});

test('conversion stage whitelist accepts admission and rejects unknown stage, free-form content, secret fields',()=>{
 const value=metricsBody().metrics;assert(contract.validateConversionMetrics({...value,stage:'admission'}));
 assert.equal(contract.validateConversionMetrics({...value,stage:'secret-text'}),null);
 assert.equal(contract.validateConversionMetrics({...value,apiKey:'synthetic'}),null);
 assert.equal(contract.validateConversionMetrics({...value,text:'synthetic source'}),null);
 assert.equal(contract.validateContactInput({...contactBody(),headers:{secret:'synthetic'}}).ok,false);
 assert.equal(contract.validateIssueReport({...issueBody(),headers:{secret:'synthetic'}}).ok,false);
});
