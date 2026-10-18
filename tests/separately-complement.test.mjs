import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const dir=mkdtempSync(join(tmpdir(),'scrambler-separately-'));
after(()=>rmSync(dir,{recursive:true,force:true}));
const bundle=await build({entryPoints:[resolve('lib/presets.ts')],bundle:true,platform:'node',format:'esm',write:false});
const file=join(dir,'presets.mjs');writeFileSync(file,bundle.outputFiles[0].text);
const{presetRewrite,STYLE_DICTIONARIES}=await import(pathToFileURL(file));
const styles=['business','academic','casual'];
const pair=['separately','individually'];
const isForward=e=>e.original.toLowerCase()===pair[0]&&e.replacement.toLowerCase()===pair[1];
function onlyPair(run){const saved=STYLE_DICTIONARIES.en.business;try{STYLE_DICTIONARIES.en.business=[pair];run(text=>presetRewrite(text,'en','business'));}finally{STYLE_DICTIONARIES.en.business=saved;}}

test('existing dictionaries retain standalone separately directions',()=>{
 for(const style of ['business','academic']){
  assert(STYLE_DICTIONARIES.en[style].some(([s,t])=>s===pair[0]&&t===pair[1]));
  const r=presetRewrite('The researchers interviewed each participant separately.','en',style);
  assert(r.edits.some(isForward));assert.equal(r.rewritten,'The researchers interviewed each participant individually.');
 }
});
test('separately from keeps its separation relation in every style',()=>{
 for(const style of styles)for(const text of ['Store invoices separately from receipts.','Keep the red samples separately from the blue ones.']){
  const r=presetRewrite(text,'en',style);assert.equal(r.rewritten,text);assert(!r.edits.some(isForward));
 }
});
test('case and whitespace do not hide the from complement',()=>onlyPair(rewrite=>{
 for(const word of ['separately','SEPARATELY'])for(const from of ['from','FROM'])for(const gap of [' ','  ','\t','\n','\r\n','\u00a0']){
  const text=`Store invoices ${word}${gap}${from} receipts.`;assert.equal(rewrite(text).rewritten,text);
 }
}));
test('negated, modified and coordinated heads still retain from',()=>onlyPair(rewrite=>{
 for(const text of ['Do not store invoices separately from receipts.','Store invoices completely separately from receipts.','Store invoices and letters separately from receipts.'])assert.equal(rewrite(text).rewritten,text);
}));
test('each occurrence is checked against its own following complement',()=>onlyPair(rewrite=>{
 const text='Store invoices separately from receipts. Interview each participant separately.';
 const r=rewrite(text);assert.equal(r.rewritten,'Store invoices separately from receipts. Interview each participant individually.');
 assert.equal(r.edits.length,1);assert.equal(r.edits[0].occurrence,1);
}));
test('a later from in another phrase does not suppress an independent use',()=>onlyPair(rewrite=>{
 for(const text of ['Interview each participant separately. From these answers, collect the figures.','The packages arrived separately, from different towns.'])assert(rewrite(text).edits.some(isForward),text);
}));
test('from prefixes inside a word do not activate the complement guard',()=>onlyPair(rewrite=>{
 // Synthetic lexical boundaries isolate this guard rather than assert sentence quality.
 for(const suffix of ['fromage','from2','from_thing','from\u0301']){
  const text=`They recorded separately ${suffix} for the sample label.`;assert(rewrite(text).edits.some(isForward),suffix);
 }
}));
test('the reverse direction is unchanged',()=>{
 const text='The researchers interviewed each participant individually.';
 const r=presetRewrite(text,'en','business');assert.equal(r.rewritten,'The researchers interviewed each participant separately.');
});
test('quoted and word-internal matches remain protected',()=>onlyPair(rewrite=>{
 for(const text of ['They wrote "separately from receipts" in the notes.','The label says inseparately from the other entries.','The label says separately-named files were retained.'])assert.equal(rewrite(text).rewritten,text);
}));
