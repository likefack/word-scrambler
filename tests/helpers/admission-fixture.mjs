// Existing storage/provider unit tests isolate durable admission here.
// The real public API admission is independently exercised in Workerd + D1 by
// public-api-admission.test.mjs. This fixture is never imported by application code.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
export const admissionFixtureSource = `export async function admitPublicApi(){return {allowed:true,release:async()=>{},providerTimeoutMs:async()=>60000};}`;
export function admissionFixturePlugin(root) {
 return {name:'explicit-unit-admission-fixture',setup(build){
  build.onResolve({filter:/public-api-admission$/},()=>({path:'admission',namespace:'unit-admission'}));
  build.onLoad({filter:/.*/,namespace:'unit-admission'},()=>{
   const original=readFileSync(root+'/lib/public-api-admission.ts','utf8');
   const transport=original.slice(original.indexOf('export function publicJsonRequestError'),original.indexOf('/** Admission is one'));
   return {contents:admissionFixtureSource+'\n'+transport,loader:'ts'};
  });
 }};
}
export function admissionFixtureModule(source){
 const transport=source.slice(source.indexOf('export function publicJsonRequestError'),source.indexOf('/** Admission is one'));
 return ts.transpileModule(admissionFixtureSource+'\n'+transport,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
}
