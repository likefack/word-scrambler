import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const dir=mkdtempSync(join(tmpdir(),'scrambler-explicit-titles-'));
after(()=>rmSync(dir,{recursive:true,force:true}));
const bundle=await build({entryPoints:[resolve('lib/presets.ts')],bundle:true,platform:'node',format:'esm',write:false});
const file=join(dir,'presets.mjs');writeFileSync(file,bundle.outputFiles[0].text);
const{presetRewrite,classifyStyle,STYLE_DICTIONARIES}=await import(pathToFileURL(file));
const labels=['題名','タイトル','表題','標題','副題','曲名','書名'];
const phrase='将来について考察する';
const rewrite=text=>presetRewrite(text,'ja','academic');

test('a live old dictionary direction is exercised by the synthetic title fixture',()=>{
 const result=rewrite(phrase+'。');assert(result.edits.some(e=>e.original==='について考察する'&&e.replacement==='に関して考察する'));
});
test('postposed explicit title labels preserve old dictionary matches',()=>{
 for(const label of labels){const text=`新しい作品には${phrase}という${label}が付いている。`;assert.equal(rewrite(text).rewritten,text,label);}
});
test('a topic-labelled title remains literal before its value',()=>{
 for(const label of labels){const text=`新しい作品の${label}は${phrase}である。`;assert.equal(rewrite(text).rewritten,text,label);}
});
test('ASCII and Japanese colon title labels are literal assignments',()=>{
 for(const label of labels)for(const separator of [':','：',' : ']){const text=label+separator+phrase+'。';assert.equal(rewrite(text).rewritten,text);}
});
test('other explicit reported-title constructions preserve the same title',()=>{
 for(const connector of ['といった','と呼ばれる','との']){const text=`新しい作品には${phrase}${connector}題名が付いている。`;assert.equal(rewrite(text).rewritten,text);}
});
test('ordinary discussion of a title is still eligible for the old mapping',()=>{
 for(const label of labels){const text=`会議では${label}について考察する。`;assert(rewrite(text).edits.some(e=>e.original==='について考察する'),label);}
});
test('ordinary title commentary with a contrast remains eligible',()=>{
 for(const text of ['タイトルは重要だが、内容を確認する方が先だ。','題名は関係ないが、予算について考察する。'])assert(rewrite(text).edits.length>0,text);
});
test('topic-led values need an explicit identity or naming ending',()=>{
 for(const ending of ['である','です','だった','とした','に決まった']){const text=`作品の題名は${phrase}${ending}。`;assert.equal(rewrite(text).rewritten,text);}
});
test('problem, assignment and topic compounds are not title cues',()=>{
 for(const noun of ['問題','課題','話題']){const text=`会議では${noun}について考察する。`;assert(rewrite(text).edits.some(e=>e.original==='について考察する'),noun);}
});
test('title cue does not protect ordinary neighboring sentences',()=>{
 const title=`新しい作品には${phrase}という題名が付いている。`;
 for(const separator of ['','\n','\r\n']){
  const outside=phrase+'。';const text=outside+title+separator+outside;const r=rewrite(text);
  assert(r.rewritten.includes(title));assert(r.edits.some(e=>e.start<outside.length));assert(r.edits.some(e=>e.start>=outside.length+title.length+separator.length));
 }
});
test('an ordinary next sentence remains available after an unresolved-title statement',()=>{
 const text='題名はまだ決まっていない。'+phrase+'。';const r=rewrite(text);assert(r.edits.some(e=>e.original==='について考察する'));
});
test('title contents do not contribute automatic style evidence',()=>{
 const neutral='猫がいる。',title=`論文の題名は研究と分析の方法について考察するである。`;
 assert.deepEqual(classifyStyle(title+neutral,'ja'),classifyStyle(neutral,'ja'));
});
test('shared protection applies in every dictionary style and leaves quoted behavior intact',()=>{
 const text=`資料をご確認くださいという題名が付いている。`;
 for(const style of ['business','academic','casual'])assert.equal(presetRewrite(text,'ja',style).rewritten,text);
 const quoted='「'+phrase+'」を読んだ。';assert.equal(rewrite(quoted).rewritten,quoted);
});
test('conservative title-clause protection also withholds ordinary wording in that clause',()=>{
 const text=`新しい作品には${phrase}という題名が付いており、調査を継続する。`;assert.equal(rewrite(text).rewritten,text);
});
test('emoji and decomposed graphemes preserve offsets outside the title clause',()=>{
 const title=`🙂Cafe\u0301の本には${phrase}という題名が付いている。`,text=title+phrase+'。',r=rewrite(text);
 assert(r.rewritten.startsWith(title));assert(r.edits.length>0);for(const edit of r.edits){assert(edit.start>=title.length);assert.equal(text.slice(edit.start,edit.end),edit.original);}
});
test('no dictionary registrations are added or removed by title protection',()=>{
 assert.equal(Object.values(STYLE_DICTIONARIES).flatMap(x=>Object.values(x)).reduce((n,pairs)=>n+pairs.length,0),12639);
});
