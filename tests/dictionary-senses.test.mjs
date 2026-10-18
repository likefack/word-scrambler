import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const dir=mkdtempSync(join(tmpdir(),'scrambler-senses-'));
after(()=>rmSync(dir,{recursive:true,force:true}));
const bundle=await build({entryPoints:[resolve('lib/presets.ts')],bundle:true,platform:'node',format:'esm',target:'es2022',write:false});
const path=join(dir,'presets.mjs');writeFileSync(path,bundle.outputFiles[0].text);
const {presetRewrite,STYLE_DICTIONARIES}=await import(pathToFileURL(path).href);
const styles=['business','academic','casual'];
const bareSources=['わかり','分かり'].flatMap(stem=>['やすい','やすく','やすかった','やすさ','にくい','にくく','にくかった','にくさ'].map(end=>stem+end));

test('ambiguous bare identification/comprehension alternatives are absent across the combined inventory',()=>{
 for(const style of styles)for(const[from,to]of STYLE_DICTIONARIES.ja[style]){
  assert(!(bareSources.includes(from)&&to.startsWith('理解し')),`${style}: ${from} -> ${to}`);
 }
});
for(const spelling of ['分かり','わかり']){
 for(const[ending,sentence]of [
  ['やすい',`印が大きいので入口が${spelling}やすい。位置を示す矢印もある。`],
  ['やすく',`印を付けると持ち主が${spelling}やすくなる。色は自由に選べる。`],
  ['やすかった',`廊下が明るく入口が${spelling}やすかった。矢印も付いていた。`],
  ['やすさ',`入口の${spelling}やすさを比較した。看板の位置だけを変えた。`],
  ['にくい',`同じ袋が並んで持ち主が${spelling}にくい。印を探している。`],
  ['にくく',`霧が出ると入口が${spelling}にくくなる。看板は遠くにある。`],
  ['にくかった',`昨夜は入口が${spelling}にくかった。照明は消えていた。`],
  ['にくさ',`入口の${spelling}にくさを記録した。目印の数も調べた。`],
 ])test(`${spelling+ending}: identification is not narrowed to comprehension`,()=>{
  for(const style of styles){const result=presetRewrite(sentence,'ja',style);assert(!result.rewritten.includes('理解し'),`${style}: ${result.rewritten}`);assert(result.rewritten.includes(spelling+ending));}
 });
}
test('silence does not automatically imply a peaceful setting',()=>{
 for(const sentence of [
  'It was a quiet afternoon because nobody spoke, but every visitor feared another threat.',
  'The cell was a quiet place; the locked door and threats made it terrifying.',
 ])for(const style of styles){const result=presetRewrite(sentence,'en',style);assert(!result.rewritten.includes('peaceful'),`${style}: ${result.rewritten}`);assert(result.rewritten.includes('quiet'));}
});
test('quiet-to-peaceful directions are not offered by any style',()=>{
 for(const style of styles)for(const[from,to]of STYLE_DICTIONARIES.en[style])assert(!(/\bquiet\b/.test(from)&&/\bpeaceful\b/.test(to)));
});
test('existing qualified comprehension phrase and explicit-comprehension reverse direction remain',()=>{
 const business=presetRewrite('わかりやすい説明を用意しました。読者が内容を追えるように段階を示しました。','ja','business');
 assert(business.edits.some(e=>e.original==='わかりやすい説明'&&e.replacement==='理解しやすい説明'));
 for(const[from,to]of [['理解しやすい','わかりやすい'],['理解しにくい','わかりにくい']]){
  const result=presetRewrite(`少し${from}説明だった。最後まで読むと話の意味が見えてきた。`,'ja','casual');
  assert(result.edits.some(e=>e.original===from&&e.replacement===to),result.rewritten);
 }
});
test('uncertain degree and individual/respective observations are not silently classified as established errors',()=>{
 for(const style of styles)assert(STYLE_DICTIONARIES.en[style].some(([a,b])=>a==='slightly'&&b==='somewhat'));
 for(const style of ['business','academic'])assert(STYLE_DICTIONARIES.ja[style].some(([a,b])=>a==='個別の'&&b==='それぞれの'));
});
test('other natural style-specific alternatives remain available',()=>{
 for(const[input,language,style]of [
  ['Please review the checklist.','en','business'],
  ['I went for a walk in the park today.','en','casual'],
  ['For example, plants need sunlight.','en','academic'],
  ['とても楽しい一日だった。','ja','casual'],
  ['そのため、観察を続けた。','ja','academic'],
 ])assert(presetRewrite(input,language,style).edits.length>0,input);
});
