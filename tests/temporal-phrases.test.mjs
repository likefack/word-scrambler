import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const dir=mkdtempSync(join(tmpdir(),'scrambler-temporal-'));
after(()=>rmSync(dir,{recursive:true,force:true}));
const bundle=await build({entryPoints:[resolve('lib/presets.ts')],bundle:true,platform:'node',format:'esm',target:'es2022',write:false});
const path=join(dir,'presets.mjs');writeFileSync(path,bundle.outputFiles[0].text);
const {presetRewrite,STYLE_DICTIONARIES}=await import(pathToFileURL(path).href);
const pairs=[['before the meeting','prior to the meeting'],['after the meeting','following the meeting'],['before the deadline','ahead of the deadline']];
const styles=['business','academic','casual'];

test('ambiguous temporal-conjunction fragments are not offered as preposition substitutions',()=>{
 for(const style of styles)for(const pair of pairs)assert(!STYLE_DICTIONARIES.en[style].some(([a,b])=>a===pair[0]&&b===pair[1]),`${style}: ${pair}`);
});
test('before/after plus a clause subject preserves its conjunction',()=>{
 const cases=[
  ["The chairman's report arrived before the meeting began.",'before the meeting'],
  ['The report arrived after the meeting ended.','after the meeting'],
  ['They waited before the deadline was announced.','before the deadline'],
  ['She waited before the meeting of the committee began.','before the meeting'],
  ['He left after the meeting of the committee had ended.','after the meeting'],
  ['They waited before the deadline for applications had passed.','before the deadline'],
  ['The report arrived before the meeting, despite delays, began.','before the meeting'],
  ['They waited after the meeting, unexpectedly, ended.','after the meeting'],
  ['We waited before the deadline, which was uncertain, was announced.','before the deadline'],
  ['Before the meeting actually began, we waited outside.','before the meeting'],
  ['AFTER THE MEETING FINALLY ENDED, WE LEFT.','after the meeting'],
  ['The report arrived before the meeting\nfinally began.','before the meeting'],
 ];
 for(const style of styles)for(const [input,fragment] of cases){const output=presetRewrite(input,'en',style).rewritten;assert(output.toLowerCase().includes(fragment),`${style}: ${output}`);for(const [,bad]of pairs)assert(!output.toLowerCase().includes(bad),output);}
});
test('nominal, possessive and quoted temporal phrases stay conservatively unchanged',()=>{
 for(const style of styles)for(const input of ['We waited before the meeting.','We waited after the meeting.','We waited before the deadline.','She described the events before the meeting’s start.','They wrote "before the meeting began" in the notes.']){const output=presetRewrite(input,'en',style).rewritten;for(const [,bad]of pairs)assert(!output.toLowerCase().includes(bad),output);}
});
test('unrelated English and Japanese dictionary substitutions remain available',()=>{
 const examples=[['Please review the document.','en','business'],['今日は近所の公園を散歩した。','ja','casual']];
 for(const [input,language,style]of examples)assert(presetRewrite(input,language,style).edits.length>0,input);
});
