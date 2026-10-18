import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const dir=mkdtempSync(join(tmpdir(),'scrambler-desire-tails-'));
after(()=>rmSync(dir,{recursive:true,force:true}));
const bundle=await build({entryPoints:[resolve('lib/presets.ts')],bundle:true,platform:'node',format:'esm',target:'es2022',write:false});
const path=join(dir,'presets.mjs');writeFileSync(path,bundle.outputFiles[0].text);
const {presetRewrite}=await import(pathToFileURL(path).href);
const styles=['business','academic','casual'];
for(const [tail,rest] of [['がる','人がいる。'],['がらない','人もいる。'],['がります','。'],['がりません','。'],['がっている','人がいる。'],['がった','が、予定は決まらなかった。'],['がらなかった','。'],['がれば','、担当者に伝える。'],['がろう','とも、許可は出さない。'],['がりそう','だ。']]){
 test(`third-person desire ${tail} is not mistaken for completed past`,()=>{
  const input=`その検査を実施した${tail}${rest}順序は後で決める。`;
  for(const style of styles){const output=presetRewrite(input,'ja',style).rewritten;assert(!output.includes('行った'+tail),output);assert(output.includes('実施した'+tail),output);}
 });
}
const derived=[['さに','、申請書を何度も書き直した。'],['そうに','見えた。'],['げな','様子だった。'],['けりゃ','、先に許可を取って。'],['かろう','が、今日は器具が足りない。']];
for(const [tail,rest]of derived){
 test(`desire-derived ${tail} is not attached to the replacement past`,()=>{
  const input=`その検査を実施した${tail}${rest}実施の可否は別途決める。`;
  for(const style of styles){const output=presetRewrite(input,'ja',style).rewritten;assert(!output.includes('行った'+tail),output);assert(output.includes('実施した'+tail),output);}
 });
}
test('another existing suru-to-nonsuru direction observes the same general boundary',()=>{
 for(const [tail,rest]of [['がる','人がいる。'],['がらない','人もいる。'],...derived])for(const style of styles){
  const output=presetRewrite(`作業を開始した${tail}${rest}予定はまだ決まっていない。`,'ja',style).rewritten;
  assert(!output.includes('始めた'+tail),output);
 }
});
test('ordinary past, contrast, reason and enumeration still transform',()=>{
 for(const ending of ['。','が、担当者は結果を記録した。','が問題は残った。','から、結果を記録する。','けれど、結果は同じだった。','けれども、結論は保留した。','り、資料を確認したりした。']){
  const input='その検査を実施した'+ending+'担当者は記録を机に置いた。';
  for(const style of ['business','academic']){const result=presetRewrite(input,'ja',style);assert(result.rewritten.includes('行った'+ending.split(/[。、]/)[0]),result.rewritten);assert(result.edits.some(e=>e.original==='実施した'&&e.replacement==='行った'),result.rewritten);}
 }
});
test('complete first-person desire alternatives retain their full conjugation',()=>{
 for(const [source,target]of [['実施したい','行いたい'],['実施したくない','行いたくない']]){
  for(const style of ['business','academic']){const result=presetRewrite(`担当者は${source}と考えている。手順を先に確認する。`,'ja',style);assert(result.rewritten.includes(target),result.rewritten);}
 }
});
test('protected quotes and unrelated English transformations remain stable',()=>{
 const quote='「その検査を実施したが、結果は同じだった。」';
 assert.equal(presetRewrite(quote,'ja','business').rewritten,quote);
 assert(presetRewrite('Please review the checklist.','en','business').edits.length>0);
});

test('desire-like prefixes inside following nouns do not suppress genuine past',()=>{
 const input='地域で実施したがれきの調査について結果を伝えた。写真も資料に添えた。';
 for(const style of ['business','academic']){
  const result=presetRewrite(input,'ja',style);
  assert(result.edits.some(e=>e.original==='実施した'&&e.replacement==='行った'),result.rewritten);
  assert(result.rewritten.includes('行ったがれきの調査'),result.rewritten);
 }
});
