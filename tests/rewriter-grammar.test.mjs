import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const temp=mkdtempSync(join(tmpdir(),'scrambler-grammar-'));after(()=>rmSync(temp,{recursive:true,force:true}));
for(const name of ['rewriter-grammar','rewriter']){const source=readFileSync(new URL('../lib/'+name+'.ts',import.meta.url),'utf8');const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replaceAll("'./rewriter-grammar'",JSON.stringify(pathToFileURL(join(temp,'rewriter-grammar.mjs')).href));writeFileSync(join(temp,name+'.mjs'),js);}
const {unsafeEditReason,unsafeReconstructionReason}=await import(pathToFileURL(join(temp,'rewriter-grammar.mjs')));
const {applyModelOutput,buildPrompt}=await import(pathToFileURL(join(temp,'rewriter.mjs')));
function check(source,original,replacement){const start=source.indexOf(original);assert(start>=0);return unsafeEditReason(source,original,replacement,start,start+original.length)||unsafeReconstructionReason(source,source.slice(0,start)+replacement+source.slice(start+original.length));}
const bad=[
 ['今日は少し早起きして、散歩した。','早起き','少し早めに起床','context_duplicate'],
 ['空気はひんやりしていて、目が覚めた。','ひんやり','冷たくて清々しい','grammar_join'],
 ['歩くと頭がすっきりしてきた。','頭がすっきり','頭が軽くなる','grammar_join'],
 ['焼きたてのパンを買った。','焼きたて','熱々','semantic_attribute'],
 ['特別なことは何もなかった。','特別なこと','何か特別な出来事','scope_change'],
 ['こんな穏やかな朝もいいと思う。','こんな穏やかな朝','このように静かな朝','semantic_attribute'],
 // Unrelated contexts exercising the same general mechanisms.
 ['結果を十分に注意して確認する。','注意','慎重に確認する','grammar_join'],
 ['この部屋は明るくなった。','明るく','明るい','grammar_join'],
 ['スープが冷たくて飲めない。','冷たく','冷たい','grammar_join'],
 ['彼はとても忙しい。','忙しい','とても多忙だ','context_duplicate'],
 ['The task was very difficult.','difficult','very hard','context_duplicate'],
 ['We need to begin the task.','begin','to start','context_duplicate'],
 ['This is freshly made soup.','freshly made','hot','semantic_attribute'],
 ['They certainly understand it.','certainly','perhaps','scope_change'],
 ['誰かが確認した。','誰か','担当者','scope_change'],
 ['資料を確認する。','資料','すべての資料','scope_change'],
 ['料理を作ったばかりだった。','作ったばかり','温かい','semantic_attribute'],
 ['朝は静かだった。','静か','爽やか','semantic_attribute'],
];
for(const [source,original,replacement,reason] of bad)test('reject: '+source+' / '+replacement,()=>assert.equal(check(source,original,replacement),reason));
const good=[
 ['今日は少し早起きして散歩した。','早起きして','早めに起きて'],
 ['空気はひんやりしていて、目が覚めた。','ひんやりしていて','涼しく感じられて'],
 ['歩くと頭がすっきりしてきた。','頭がすっきりしてきた','頭が冴えてきた'],
 ['焼きたてのパンを買った。','焼きたて','焼いたばかり'],
 ['彼と相談してみた。','相談','話'],
 ['作業を慎重に進めた。','慎重に','注意深く'],
 ['This is freshly made soup.','freshly made','just prepared'],
 ['We have already begun the project.','begun','started'],
 ['They did not complete the task.','complete','finish'],
 ['This seems perhaps unnecessary.','perhaps','possibly'],
];
for(const [source,original,replacement] of good)test('allow supported boundary: '+replacement,()=>assert.equal(check(source,original,replacement),undefined));
test('existing repeated text is not silently corrected or counted as introduced duplication',()=>{assert.equal(unsafeReconstructionReason('とてもとても寒い。','とてもとても冷える。'),undefined);assert.equal(unsafeReconstructionReason('This was very very cold.','This was very very chilly.'),undefined);});
test('combined adjacent edits are checked in reconstructed context',()=>{assert.equal(unsafeReconstructionReason('とても寒い。','かなりかなり冷たい。'),'context_duplicate');assert.equal(unsafeReconstructionReason('彼の仕事。','彼のの仕事。'),'grammar_join');});
test('actual reported six hazardous candidates are all rejected while source is preserved',()=>{const source='今日は少し早起きして、近所の公園を散歩した。\n朝の空気はひんやりしていて、歩いているうちに頭がすっきりしてきた。帰り道に小さなパン屋を見つけたので、焼きたてのパンを買って帰った。\n特別なことは何もなかったけれど、こんな穏やかな朝もいいなと思った。';const edits=bad.slice(0,6).map(([,original,replacement])=>({original,replacement,occurrence:0}));const raw={style:{label:'日常',features:[],explanation:''},protected_terms:[],edits,note:''};const checked=applyModelOutput(source,raw,{alignUniqueOccurrence:true,checkContextGrammar:true});assert.equal(checked.rewritten,source);assert.equal(checked.edits.length,0);assert.equal(checked.selection.proposed,6);assert.deepEqual(checked.selection.rejected,{context_duplicate:1,grammar_join:2,semantic_attribute:2,scope_change:1});const legacy=applyModelOutput(source,raw);assert(legacy.edits.length>0);});
test('prompt requests complete inflected units and whole-sentence review within the same response',()=>{const prompt=buildPrompt('今日は少し早起きして散歩した。');assert(prompt.includes('活用語尾・補助動詞'));assert(prompt.includes('語幹だけの置換は禁止'));assert(prompt.includes('組み戻した全文'));});
test('repetition checks do not treat word-internal のの or sentence-separated words as duplicate particles',()=>{assert.equal(unsafeReconstructionReason('嬉しいけれど、心配もある。','嬉しいものの、心配もある。'),undefined);assert.equal(unsafeReconstructionReason('The word is blue. Green is another color.','The word is blue. Blue is another color.'),undefined);});
