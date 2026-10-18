import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const temp=mkdtempSync(join(tmpdir(),'scrambler-frequent-'));
after(()=>rmSync(temp,{recursive:true,force:true}));
async function load(name){const built=await build({entryPoints:[resolve('lib/'+name+'.ts')],bundle:true,format:'esm',platform:'node',target:'es2022',write:false});const path=join(temp,name+'.mjs');writeFileSync(path,built.outputFiles[0].text);return import(pathToFileURL(path));}
const {presetRewrite,STYLE_DICTIONARIES}=await load('presets');
const {allowsBroadMatch}=await load('presets-broad-guards');
const {BROAD_SCOPES}=await load('presets-broad-scopes');
const {frequentAdverbDecision}=await load('presets-en-frequency-guard');
const {allowsNewJapaneseLiteralContext}=await load('presets-ja-literal-guard');
const styles=['business','academic','casual'];
function allow(text,source,target,style='business'){
 const start=text.indexOf(source);assert(start>=0);
 const scope=BROAD_SCOPES[['ja',style,source,target].join('\0')];assert(scope,'missing new scope');
 return allowsBroadMatch(text,start,start+source.length,scope,style,target);
}
function adverb(text,source,style='business') {const start=text.indexOf(source);assert(start>=0);return frequentAdverbDecision(text,start,start+source.length,style);}
test('new English contexts support ordinary recurrence and habitual statements',()=>{
 for(const text of ['We checked the room again.','Normally, we leave before noon.']){
  const source=text.includes('again')?'again':'Normally';assert(adverb(text,source).admit,text);
  assert(presetRewrite(text,'en','business').edits.some(e=>e.original.toLowerCase()===source.toLowerCase()),text);
 }
});
test('additive comparisons are not confused with recurrence',()=>{
 for(const text of ['The room is half again as large.','The room is 20 percent larger again.','The price is a third again higher.'])assert.equal(adverb(text,'again').admit,false,text);
});
test('English correlatives, negation and technical readings keep their source',()=>{
 for(const [text,source]of [['We not only checked the door but also secured it.','also'],['We never checked the room again.','again'],['The values are normally distributed.','normally'],['Almost no chairs remain.','Almost']])assert.equal(adverb(text,source).admit,false,text);
});
test('English source protection spans multi-line quotes and original UTF-16 offsets',()=>{
 assert.equal(adverb('He wrote "We checked\nthe room again."','again').admit,false);
 assert(adverb('🙂 We checked the room again.','again').admit);
 const bad=frequentAdverbDecision('again',-1,5,'business');assert.equal(bad.admit,false);assert.equal(bad.reason,'invalid_utf16_span');
});
test('Japanese positive degree phrases are admitted only in their reviewed context',()=>{
 assert(allow('使ってみると、とても便利です。','とても便利','非常に便利'));
 const result=presetRewrite('使ってみると、とても便利です。','ja','business');assert(result.edits.some(e=>e.original==='とても便利'&&e.replacement==='非常に便利'),result.rewritten);
 assert.equal(allow('とても便利とは言えない。','とても便利','非常に便利'),false);
});
test('new Japanese noun direction does not touch compounds or names',()=>{
 assert(allow('地図が机の上にある。','地図','マップ'));
 assert.equal(allow('地図帳が机の上にある。','地図','マップ'),false);
 assert.equal(allow('店名は地図にした。','地図','マップ'),false);
});
test('literal recording cues block this new batch but ordinary reporting words do not',()=>{
 assert.equal(allow('清掃と記した。','清掃','掃除'),false);
 assert.equal(allow('清掃を記録した。','清掃','掃除'),false);
 assert(allow('記者が清掃を始める。','清掃','掃除'));
});
test('co-occurring alternatives are not collapsed, including separate sentences',()=>{
 for(const text of ['清掃と掃除を対比する。','清掃について話す。別の項目は掃除だ。'])assert.equal(allow(text,'清掃','掃除'),false,text);
 // This conservative rule also withholds an ordinary, potentially valid change.
 assert.equal(allow('清掃を終えた。午後は別の部屋を掃除する。','清掃','掃除'),false);
});
test('the co-occurrence gate ignores a target wholly inside its own source span',()=>{
 const text='清掃する。';assert(allowsNewJapaneseLiteralContext(text,0,2,'清'));
});
test('exact-copy and labeled literal payloads remain protected across newlines',()=>{
 for(const text of ['以下の文をそのままコピーする。\nとても便利です。','例文：\nとても便利です。'])assert.equal(allow(text,'とても便利','非常に便利'),false,text);
});
test('old mapping priorities and old scope tags are not replaced by this batch',()=>{
 for(const style of styles){
  assert.equal(BROAD_SCOPES[['ja',style,'比較する','比べる'].join('\0')],'ja-complete-entry');
  assert.equal(STYLE_DICTIONARIES.ja[style].find(p=>p[0]==='比較する')[1],'比べる');
 }
 assert.equal(STYLE_DICTIONARIES.en.business.find(p=>p[0]==='postpone')[1],'delay');
 assert.equal(BROAD_SCOPES[['ja','business','準備を','用意を'].join('\0')],undefined);
});
test('new helper licenses are MIT and none adds a network, storage or provider dependency',()=>{
 const map=JSON.parse(readFileSync('LICENSE-SCOPE.json','utf8'));
 for(const name of ['presets-en-frequency-guard','presets-ja-frequency-guard','presets-ja-literal-guard']){
  const path='lib/'+name+'.ts',source=readFileSync(path,'utf8');assert(map.newSoftwareFiles.includes(path));assert(source.startsWith('// SPDX-License-Identifier: MIT'));
  assert(!/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|console)\b/.test(source));
 }
});
