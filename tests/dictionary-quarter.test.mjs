import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
async function bundle(path){
 const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false});
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const {presetRewrite,STYLE_DICTIONARIES}=await bundle('lib/presets.ts');
const {applyModelOutput,changedWordCount}=await bundle('lib/rewriter.ts');
const {dictionaryWordBudget,changedOriginalWordIndices,measurePresetOutput}=await bundle('lib/presets-metrics.ts');
const {isOrthographicOnlyPair}=await bundle('lib/presets-orthography.ts');
const base={style:{label:'Synthetic',features:[],explanation:''},protected_terms:[],note:''};

test('dictionary quarter ceiling uses floor without short-text overshoot',()=>{
 for(let n=0;n<=3000;n++)assert.equal(dictionaryWordBudget(n),Math.floor(n/4));
 for(const [source,style]of [['その検査を実施した。','business'],['資料をご確認ください。','business'],['加えて、作業時間も記録する。','academic']]){
  const r=presetRewrite(source,'ja',style);assert.equal(r.changedWords,0);assert(r.selection.rejected.total_budget||r.selection.rejected.full_text_budget);
 }
});
test('the stricter cap is opt-in and cannot enlarge the AI default ceiling',()=>{
 const source='red blue green yellow alpha beta gamma delta epsilon zeta eta theta iota';
 const data={...base,edits:[{original:'red blue',replacement:'amber',occurrence:0},{original:'green yellow',replacement:'violet',occurrence:0}]};
 assert.equal(applyModelOutput(source,data).changedWords,4);
 assert.equal(applyModelOutput(source,data,{maxChangedWords:3}).changedWords,2);
 assert.deepEqual(applyModelOutput(source,data,{maxChangedWords:999}),applyModelOutput(source,data));
 for(const n of [-1,NaN,Infinity,1.5])assert.throws(()=>applyModelOutput(source,data,{maxChangedWords:n}),RangeError);
});
test('registrations remain complete; exactly the seventeen audited spelling pairs are filtered',()=>{
 const pairs=Object.values(STYLE_DICTIONARIES).flatMap(Object.values).flat();
 assert.equal(pairs.length,12639);
 assert.equal(pairs.filter(([a,b])=>isOrthographicOnlyPair(a,b)).length,17);
 for(const [a,b]of [["先日の打ち合わせ", "先日の打合せ"], ["打ち合わせの日程", "打合せの日程"], ["打ち合わせの内容", "打合せの内容"], ["後ほど", "のちほど"], ["朝ごはん", "朝ご飯"], ["昼ごはん", "昼ご飯"], ["晩ごはん", "晩ご飯"], ["夜ごはん", "夜ご飯"], ["夕ごはん", "夕ご飯"], ["部屋を片づけた", "部屋を片付けた"], ["机を片づけた", "机を片付けた"], ["荷物を片づけた", "荷物を片付けた"], ["片付けが終わった", "片づけが終わった"], ["お腹いっぱい", "おなかいっぱい"], ["喉が渇いた", "のどが渇いた"], ["温かいお茶", "あたたかいお茶"], ["何となく", "なんとなく"]]){
  assert(isOrthographicOnlyPair(a,b));assert(isOrthographicOnlyPair(b,a));
 }
});
test('spelling filter does not conflate semantic phrases, particles or Latin word boundaries',()=>{
 for(const [a,b]of [['は','が'],['の','に'],['re-sign','resign'],["let's",'lets'],['a part','apart'],['お腹がすいた','お腹がへった'],['について分析する','に関して分析する'],['とても','すごく']])assert(!isOrthographicOnlyPair(a,b));
});
test('audited spelling pairs no longer inflate real preset output',()=>{
 const source='今日は喉が渇いた。水を飲んでから部屋を片づけた。昼食の後はお腹いっぱいだった。';
 const r=presetRewrite(source,'ja','casual');
 assert(r.rewritten.includes('喉が渇いた'));assert(r.rewritten.includes('部屋を片づけた'));assert(r.rewritten.includes('お腹いっぱい'));
 assert(r.edits.every(e=>!isOrthographicOnlyPair(e.original,e.replacement)));
 assert(r.changedWords<=Math.floor(r.totalWords/4));
});
test('canonical LCS keeps additions separate from source-word losses',()=>{
 assert.deepEqual(changedOriginalWordIndices('a b c d e f','x b c y e z'),[0,3,5]);
 assert.deepEqual(changedOriginalWordIndices('a b c','new a b c ending'),[]);
 assert.deepEqual(changedOriginalWordIndices('a a','a'),[1]);
 assert.deepEqual(changedOriginalWordIndices('a b','b a'),[0]);
});
test('diagnostic LCS attribution agrees with canonical count for repeated-token sequences',()=>{
 const vectors=[''];for(let n=1;n<=4;n++)for(let k=0;k<2**n;k++)vectors.push(Array.from({length:n},(_,i)=>k>>i&1?'a':'b').join(' '));
 for(const a of vectors)for(const b of vectors)assert.equal(changedOriginalWordIndices(a,b).length,changedWordCount(a,b));
});
test('third boundaries and edit midpoint use fixed source-word floors',()=>{
 const x=measurePresetOutput('a b c d e','x b c y e',[{start:0,end:1},{start:6,end:7}]);
 assert.deepEqual(x.originalTokenThirds.totalWords,[1,2,2]);
 assert.deepEqual(x.originalTokenThirds.changedWords,[1,0,1]);
 assert.deepEqual(x.originalWordMidpointThirds.edits,[1,0,1]);
 const y=measurePresetOutput('a b c d e f','x b c y e z',[{start:0,end:11}]);
 assert.deepEqual(y.originalTokenThirds.changedWords,[1,1,1]);assert.deepEqual(y.originalWordMidpointThirds.edits,[0,1,0]);
});
for(const [language,source]of [
 ['en',Array(8).fill('Please review the report and provide an update. The team will complete the task and prepare the materials.').join('\n')],
 ['ja',Array(8).fill('さまざまな条件について分析する。さらに、資料を確認してから同じ手順を繰り返す。').join('\n')],
])for(const style of ['business','academic','casual'])test('full source cap, stable denominator and deterministic output: '+language+'/'+style,()=>{
 const r=presetRewrite(source,language,style),m=measurePresetOutput(source,r.rewritten,r.edits);
 assert(r.changedWords<=Math.floor(r.totalWords/4));assert.equal(m.changedWords,r.changedWords);assert.equal(m.totalWords,r.totalWords);assert(m.withinBudget);assert.deepEqual(r,presetRewrite(source,language,style));
});
test('preset notes do not expose development targets or progress commentary',()=>{
 const r=presetRewrite('Please review the report carefully. The team waits beside the door.','en','business');
 assert(!r.notes.join(' ').includes('25%'));assert(!r.notes.join(' ').includes('開発'));
});
