import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const dir=mkdtempSync(join(tmpdir(),'scrambler-ja-structure-'));after(()=>rmSync(dir,{recursive:true,force:true}));
for(const name of ['rewriter-grammar','rewriter']){const source=readFileSync(new URL('../lib/'+name+'.ts',import.meta.url),'utf8');writeFileSync(join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replaceAll("'./rewriter-grammar'","'./rewriter-grammar.mjs'"));}
const {applyModelOutput}=await import(pathToFileURL(join(dir,'rewriter.mjs')));
const {unsafeEditReason,unsafeReconstructionReason}=await import(pathToFileURL(join(dir,'rewriter-grammar.mjs')));
const check=(text,original,replacement)=>{const start=text.indexOf(original);assert(start>=0);return unsafeEditReason(text,original,replacement,start,start+original.length);};
const bad=[
 ['在庫が多ければ倉庫を借りる。','多ければ','多くて','scope_change'],
 ['作業が終われば連絡する。','終われば','終わって','scope_change'],
 ['時間がある場合は相談する。','ある場合は','あって','scope_change'],
 ['必要ならば道具を借りる。','必要ならば','必要なので','scope_change'],
 ['記録を読んでもらう予定だ。','読んでもらう','読んでくれる','scope_change'],
 ['担当者に調べてもらう。','もらう','くれる','scope_change'],
 ['友人が荷物を持ってくれた。','持ってくれた','持ってもらった','scope_change'],
 ['同行者に手伝ってあげた。','手伝ってあげた','手伝ってもらった','scope_change'],
 ['道具を増やす前に収納を確認する。','増やす','増やそう','grammar_join'],
 ['計画を変える前に相談する。','変える','変えよう','grammar_join'],
 ['意見を聞くときは記録する。','聞く','聞こう','grammar_join'],
 ['事実を調べるために訪問した。','調べる','調べよう','grammar_join'],
 ['準備する予定を共有した。','準備する','準備しよう','grammar_join'],
 ['この説明は明快である。','明快である','明快','grammar_join'],
 ['その対応は丁寧です。','丁寧です','丁寧','grammar_join'],
 ['以前の案は簡潔であった。','簡潔であった','簡潔','grammar_join'],
 ['この案は合理的である。','合理的である','合理的だ','grammar_join'],
];
for(const [s,o,r,reason] of bad)test('abstain from changed structure: '+r,()=>assert.equal(check(s,o,r),reason));
const good=[
 ['在庫が多ければ倉庫を借りる。','多ければ','多い場合は'],
 ['作業が終われば連絡する。','終われば','完了すれば'],
 ['道具を調べる前に記録する。','調べる','確認する'],
 ['担当者に確認してもらう。','してもらう','していただく'],
 ['担当者に確認してもらう。','もらう','いただく'],
 ['資料を見てくれる人を探す。','見てくれる','確認してくれる'],
 ['この説明は明快である。','明快である','分かりやすいのである'],
 ['この案は重要である。','重要である','大切である'],
 ['その対応は丁寧です。','丁寧です','親切です'],
 ['以前の案は簡潔であった。','簡潔であった','短めであった'],
 ['例えば、別の方法もある。','例えば','一例として'],
 ['たとえば、別の方法もある。','たとえば','例を挙げると'],
 ['料理をいただく前に席に着く。','料理','食事'],
 ['どう思う前にも確認が必要だ。','思う','考える'],
 ['このような例は多い。','このような','こうした'],
 ['This is a clear explanation.','clear','straightforward'],
];
for(const [s,o,r] of good)test('retain supported structure: '+r,()=>assert.equal(check(s,o,r),undefined));
test('adopt good lexical edit but reject four independent structural failures',()=>{
 const text='在庫が多ければ倉庫を借りる。担当者に調べてもらう。道具を増やす前に記録を確かめる。この説明は明快である。各項目を順番に記録し、担当者と十分に相談してから次の作業を進める。';
 const edits=[['多ければ','多くて'],['調べてもらう','調べてくれる'],['増やす','増やそう'],['明快である','明快'],['確かめる','確認する']].map(([original,replacement])=>({original,replacement,occurrence:0}));
 const raw={style:{label:'説明',features:[],explanation:''},protected_terms:[],edits,note:''};
 const r=applyModelOutput(text,raw,{alignUniqueOccurrence:true,checkContextGrammar:true});
 assert.deepEqual(r.edits.map(e=>e.original),['確かめる']);assert.deepEqual(r.selection.rejected,{scope_change:2,grammar_join:2});assert.equal(r.selection.proposed,5);
});
test('combined output keeps the same structural checks and unchanged malformed source is not repaired',()=>{
 assert.equal(unsafeReconstructionReason('在庫が多ければ追加する。','在庫が多くて追加する。'),'scope_change');
 assert.equal(unsafeReconstructionReason('道具を増やす前に調べる。','道具を増やそう前に調べる。'),'grammar_join');
 assert.equal(unsafeReconstructionReason('道具を増やそう前に調べる。','道具を増やそう前に確認する。'),undefined);
});
for(const [s,o,r] of [
 ['受付時間を延ばす案を検討した。','延ばす','延長'],
 ['費用を減らす計画を確認する。','減らす','削減'],
 ['部品を交換する予定を共有した。','交換する','交換'],
 ['道路を整備する方針は決まっている。','整備する','整備'],
])test('reject lost attributive predicate: '+r,()=>assert.equal(check(s,o,r),'grammar_join'));
for(const [s,o,r] of [
 ['受付時間を延ばす案を検討した。','延ばす','延長する'],
 ['受付時間を延ばす案を検討した。','受付時間を延ばす案','受付時間の延長案'],
 ['受付時間を延ばす案を検討した。','受付時間を延ばす案','受付時間延長案'],
 ['予算を一年間の計画に割り当てる。','一年間の計画','年間計画'],
 ['費用を減らす計画を確認する。','減らす','削減する'],
])test('allow complete predicate or nominal phrase: '+r,()=>assert.equal(check(s,o,r),undefined));
for(const [s,o,r] of [
 ['警告の発生回数が増えた。','発生回数が増えた','発生頻度が高まった'],
 ['通知の頻度を記録した。','頻度','回数'],
])test('reject count/frequency concept swap: '+r,()=>assert.equal(check(s,o,r),'semantic_attribute'));
for(const [s,o,r] of [
 ['警告の発生回数が増えた。','増えた','増加した'],
 ['通知の頻度を記録した。','記録した','書き留めた'],
])test('allow count/frequency-preserving edit: '+r,()=>assert.equal(check(s,o,r),undefined));
test('locative で is not assumed to be a benefactive auxiliary',()=>{
 for(const [s,o,r] of [
  ['ここでやります。','やります','行います'],
  ['この店でいただきます。','いただきます','食べます'],
  ['こちらにていただきます。','いただきます','食べます'],
 ])assert.equal(check(s,o,r),undefined);
});
test('a retained attributive predicate is not mistaken for a deleted one',()=>{
 const s='予算を一年間の計画に割り当てる案を検討した。';
 assert.equal(check(s,'一年間の計画','年間計画'),undefined);
 assert.equal(check(s,'一年間の計画に割り当てる案','年間計画に割り当てる案'),undefined);
});
test('a later nested predicate cannot conceal an earlier predicate loss',()=>{
 const s='時間を延ばす案を検討する方法を示す。';
 assert.equal(check(s,'延ばす','延長'),'grammar_join');
 assert.equal(check(s,'延ばす','延長する'),undefined);
});
test('a changed verb may alternate conjunctive て/で while preserving benefactive direction',()=>{
 assert.equal(check('彼が箱を運んでくれました。','運んで','持ってきて'),undefined);
 assert.equal(check('荷物を持ってきてもらう。','持ってきて','運んで'),undefined);
 assert.equal(check('資料を読んでもらう。','読んでもらう','確認してくれる'),'scope_change');
});
