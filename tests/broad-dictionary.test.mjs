import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const temp=mkdtempSync(join(tmpdir(),'scrambler-broad-'));
after(()=>rmSync(temp,{recursive:true,force:true}));
async function load(file){const output=await build({entryPoints:[resolve(file)],bundle:true,format:'esm',platform:'node',target:'es2022',write:false});const path=join(temp,crypto.randomUUID()+'.mjs');writeFileSync(path,output.outputFiles[0].text);return import(pathToFileURL(path));}
const {presetRewrite,STYLE_DICTIONARIES}=await load('lib/presets.ts');
const {BROAD_SCOPES}=await load('lib/presets-broad-scopes.ts');
const {JA_BROAD}=await load('lib/presets-ja-broad.ts');
const {EN_BROAD}=await load('lib/presets-en-broad.ts');
const {allowsBroadMatch}=await load('lib/presets-broad-guards.ts');
const styles=['business','academic','casual'];
const accepts=(text,source,scope='ja-complete-entry')=>{const start=text.indexOf(source);assert(start>=0);return allowsBroadMatch(text,start,start+source.length,scope);};

test('new tables are append-only with explicit Japanese scope and deterministic source precedence',()=>{
 let total=0;
 for(const language of ['ja','en'])for(const style of styles){
  const pairs=STYLE_DICTIONARIES[language][style];total+=pairs.length;
  assert.equal(new Set(pairs.map(p=>p[0])).size,pairs.length);
  for(const [source,target]of (language==='ja'?JA_BROAD:EN_BROAD)[style]){
   assert(source&&target&&source!==target);
   assert(pairs.some(p=>p[0]===source));
   if(language==='ja')assert(['ja-complete-entry','ja-standalone-v13','ja-frequency-context-v13'].includes(BROAD_SCOPES[[language,style,source,target].join('\0')]));
  }
 }
 assert.equal(total,12639);
 assert.equal(STYLE_DICTIONARIES.en.business.find(p=>p[0]==='postpone')[1],'delay');
 assert.equal(STYLE_DICTIONARIES.en.casual.find(p=>p[0]==='wonderful')[1],'great');
});
test('added Japanese finite forms preserve polarity and politeness',()=>{
 for(const [source,target]of [['運搬する','運ぶ'],['運搬しない','運ばない'],['運搬しなかった','運ばなかった'],['運搬します','運びます'],['運搬しました','運びました'],['運搬しません','運びません'],['運搬しませんでした','運びませんでした']])for(const style of styles){
  const text=`作業員が箱を${source}。箱は倉庫にある。`;
  const result=presetRewrite(text,'ja',style);
  assert(result.edits.some(e=>e.original===source&&e.replacement===target),result.rewritten);
 }
});
test('new entries are not recursively transformed',()=>{
 const text='作業員が箱を運搬する。箱は倉庫にある。';
 assert.equal(presetRewrite(text,'ja','business').rewritten,'作業員が箱を運ぶ。箱は倉庫にある。');
 assert.deepEqual(presetRewrite(text,'ja','business'),presetRewrite(text,'ja','business'));
});
test('plain-past experimental forms are not included in the new tables',()=>{
 for(const style of styles)for(const [source]of JA_BROAD[style])assert(!source.endsWith('した')||source.endsWith('ました')||source.endsWith('でした'),source);
});
test('ordinary predicates stay available while unquoted correction and inscription reports abstain',()=>{
 assert(accepts('担当者が成果を比較する。','比較する'));
 for(const text of ['比較するではなく照合するに直す。','比較するという語句を選んだ。','画面には比較するを表示した。','答案に比較すると書いた。'])assert.equal(accepts(text,'比較する'),false,text);
});
test('quoted multi-line new expressions and quoted complements are never changed',()=>{
 for(const text of ['彼は「担当者が箱を運搬する。\n後で比較する。」と読んだ。','She wrote "We rely on the map.\nThe sofa is near the window."']){
  const language=text.startsWith('She')?'en':'ja';for(const style of styles)assert.equal(presetRewrite(text,language,style).rewritten,text);
 }
});
test('sofa beds remain a compound while ordinary sofas can be changed',()=>{
 for(const text of ['A sofa bed was placed near the window.','Several sofa beds were placed near the window.'])for(const style of styles)assert(!presetRewrite(text,'en',style).rewritten.includes('couch'),text);
 const result=presetRewrite('The sofa was next to the window.','en','casual');assert(result.edits.some(e=>e.original==='sofa'&&e.replacement==='couch'),result.rewritten);
});
test('existing r29 desire-tail protection also blocks newly adjacent examples',()=>{
 for(const tail of ['い','がる','がらない','そうに','さに'])for(const style of styles){const text=`検査を実施した${tail}人がいる。`;assert(!presetRewrite(text,'ja',style).rewritten.includes('行った'+tail));}
});
test('new data does not restore removed identification, quiet or temporal ambiguity',()=>{
 for(const style of styles){
  for(const[source,target]of STYLE_DICTIONARIES.ja[style])assert(!/^(?:わかり|分かり)(?:やす|にく)/u.test(source)||!target.startsWith('理解し')||source.includes('説明'));
  for(const[source,target]of STYLE_DICTIONARIES.en[style]){assert(!(/\bquiet\b/.test(source)&&/\bpeaceful\b/.test(target)));assert(!['before the meeting','after the meeting','before the deadline'].includes(source));}
 }
});
test('dictionary software adds no runtime NLP or network dependency',()=>{
 const pkg=JSON.parse(readFileSync('package.json','utf8'));for(const name of ['wordfreq','sudachipy','spacy','nltk','compromise','kuromoji'])assert(!pkg.dependencies[name]&&!pkg.devDependencies[name]);
 for(const file of ['presets-broad-guards','presets-broad-scopes','presets-en-broad','presets-ja-broad'])assert(!/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(readFileSync(`lib/${file}.ts`,'utf8')));
});

test('unquoted names and appellations are protected without swallowing ordinary task nouns',()=>{
 for(const head of ['曲名','愛称','表題','副題']){
  const text=`新しい${head}は努力するに決まった。`;
  for(const style of styles)assert.equal(presetRewrite(text,'ja',style).rewritten,text);
 }
 for(const head of ['問題','課題','話題'])assert(accepts(`${head}に備えて努力する。`,'努力する'));
});
