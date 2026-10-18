import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const dir=mkdtempSync(join(tmpdir(),'scrambler-multiline-quotes-'));
after(()=>rmSync(dir,{recursive:true,force:true}));
const bundle=await build({entryPoints:[resolve('lib/presets.ts')],bundle:true,platform:'node',format:'esm',target:'es2022',write:false});
const path=join(dir,'presets.mjs');writeFileSync(path,bundle.outputFiles[0].text);
const {presetRewrite,classifyStyle}=await import(pathToFileURL(path).href);
const fixtures=[
 ['en','business','Please review the checklist.'],
 ['en','academic','For example, plants need sunlight.'],
 ['en','casual','I really enjoy the walk.'],
 ['ja','business','資料をご確認ください。担当者は部屋にいます。'],
 ['ja','academic','そのため、観察を続けた。'],
 ['ja','casual','とても楽しい一日だった。'],
];
for(const [language,style,phrase]of fixtures){
 test(`${language}/${style}: balanced ASCII quotes protect content across line breaks`,()=>{
  assert(presetRewrite(phrase,language,style).edits.length>0,'fixture must exercise a real dictionary match');
  for(const newline of ['\n','\r\n','\n\n','\r']){
   const input=`"Opening line.${newline}${phrase}${newline}Closing line."`;
   const result=presetRewrite(input,language,style);
   assert.equal(result.rewritten,input,JSON.stringify({language,style,newline}));
   assert.equal(result.edits.length,0);
  }
 });
}
test('only the quoted occurrence is protected; outside candidates remain available',()=>{
 const quoted='"Opening line.\nPlease review the checklist."';
 const input=quoted+'\nPlease review the checklist.';
 const result=presetRewrite(input,'en','business');
 assert(result.rewritten.startsWith(quoted));
 assert(result.edits.length>0);
 assert(result.edits.every(edit=>edit.start>=quoted.length));
});
test('separate quoted blocks do not swallow the unquoted interval',()=>{
 const first='"First line.\nPlease review the checklist."';
 const last='"Last line.\nPlease review the checklist."';
 const input=first+'\nPlease review the checklist.\n'+last;
 const result=presetRewrite(input,'en','business');
 assert(result.rewritten.startsWith(first));assert(result.rewritten.endsWith(last));
 assert(result.edits.length>0);
 assert(result.edits.every(edit=>edit.start>=first.length&&edit.end<=input.length-last.length));
});
test('existing curly and Japanese multiline quotes retain their content',()=>{
 for(const [open,close]of [['“','”'],['「','」'],['『','』'],['‘','’']]){
  const input=open+'Opening line.\nPlease review the checklist.'+close;
  assert.equal(presetRewrite(input,'en','business').rewritten,input);
 }
});
test('multiline quote content does not supply style evidence',()=>{
 const quoted='"Opening line.\nPlease review the project proposal and meeting schedule.\nThank you for your continued support."';
 const neutral='Zebras cross open fields.';
 assert.deepEqual(classifyStyle(quoted+' '+neutral,'en'),classifyStyle(neutral,'en'));
});
test('empty and single-line quotes retain the prior matching behavior',()=>{
 const input='"" "Please review the checklist."\nPlease review the checklist.';
 const result=presetRewrite(input,'en','business');
 assert(result.rewritten.startsWith('"" "Please review the checklist."'));
 assert(result.edits.length>0);
});
