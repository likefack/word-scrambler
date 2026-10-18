import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const dir=mkdtempSync(join(tmpdir(),'scrambler-occurrence-'));after(()=>rmSync(dir,{recursive:true,force:true}));
for(const name of ['rewriter-grammar','rewriter']){const source=readFileSync(new URL('../lib/'+name+'.ts',import.meta.url),'utf8');writeFileSync(join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replaceAll("'./rewriter-grammar'","'./rewriter-grammar.mjs'"));}
const {applyModelOutput,buildPrompt}=await import(pathToFileURL(join(dir,'rewriter.mjs')));
const options={alignUniqueOccurrence:true,checkContextGrammar:true};
const base={style:{label:'input style',features:[],explanation:''},protected_terms:[],note:''};
const run=(text,edits,extra={})=>applyModelOutput(text,{...base,...extra,edits},options);
const edit=(original,replacement,occurrence)=>({original,replacement,occurrence});
for(const occurrence of [0,1,2,7,3000])test(`unique exact source matches align index ${occurrence}`,()=>{
 const r=run('We review the document before the meeting and discuss the findings afterwards.',[edit('review','check',occurrence)]);
 assert.equal(r.edits.length,1);assert.equal(r.edits[0].occurrence,0);assert.equal(r.selection.alignedUnique,occurrence?1:0);assert.equal(r.rewritten,'We check the document before the meeting and discuss the findings afterwards.');
});
test('serial numbering for different phrases has no effect on locations',()=>{
 const text='We review the document before the meeting. Afterwards, we discuss the findings and prepare a report for the team.';
 const a=run(text,[edit('review','check',0),edit('discuss','talk about',1),edit('prepare','write',2)]);
 const b=run(text,[edit('review','check',0),edit('discuss','talk about',0),edit('prepare','write',0)]);
 assert.equal(a.rewritten,b.rewritten);assert.deepEqual(a.edits,b.edits);assert.equal(a.edits.length,3);assert.equal(a.selection.alignedUnique,2);
});
test('repeated sources keep exact zero-based 0 and 1, and reject 2 or a serial number',()=>{
 const text='We review the first document, and later we review the second document before the meeting.';
 for(const n of [0,1]){const r=run(text,[edit('review','check',n)]);assert.equal(r.edits.length,1);assert.equal(r.edits[0].start,n?text.lastIndexOf('review'):text.indexOf('review'));assert.equal(r.selection.alignedUnique,0);}
 for(const n of [2,7]){const r=run(text,[edit('review','check',n)]);assert.equal(r.rewritten,text);assert.equal(r.selection.rejected.occurrence_out_of_range,1);}
});
test('mixed word-internal and whole-word occurrences are not filtered then renumbered',()=>{
 const text='We preview the document, then review it carefully before the meeting.';
 const bad=run(text,[edit('review','check',0)]);assert.equal(bad.rewritten,text);assert.equal(bad.selection.rejected.grammar_join,1);
 const good=run(text,[edit('review','check',1)]);assert.equal(good.edits[0].start,text.lastIndexOf('review'));
 const out=run(text,[edit('review','check',2)]);assert.equal(out.selection.rejected.occurrence_out_of_range,1);
});
test('unique word fragments are not rescued by index correction',()=>{
 for(const [text,original,replacement] of [['We preview the document before the meeting.','review','check'],['The word cannot is written on the page.','not','never'],['She re-evaluates the report before the meeting.','evaluates','checks']]){const r=run(text,[edit(original,replacement,8)]);assert.equal(r.rewritten,text);assert.equal(r.selection.rejected.grammar_join,1);}
});
test('grapheme and UTF-16 boundaries remain intact around emoji and combining marks',()=>{
 const text='🙂 We review the café notes before the meeting.';const r=run(text,[edit('review','check',4)]);assert.equal(r.edits[0].start,text.indexOf('review'));assert(r.rewritten.startsWith('🙂'));
 const decomposed='We visit the cafe\u0301 before the meeting.';const bad=run(decomposed,[edit('cafe','coffee shop',3)]);assert.equal(bad.rewritten,decomposed);assert.equal(bad.selection.rejected.grammar_join,1);
 const badEmoji=run(text,[edit('\ud83d','x',2)]);assert.equal(badEmoji.rewritten,text);assert.equal(badEmoji.selection.rejected.grammar_join,1);
});
test('unique alignment does not bypass negation or protected-word checks',()=>{
 const text='They did not complete the task before the meeting, although they had enough time to work on it.';
 const good=run(text,[edit('complete','finish',9)]);assert.equal(good.edits.length,1);assert(good.rewritten.includes('did not finish'));
 const bad=run(text,[edit('did not complete','completed',9)]);assert.equal(bad.rewritten,text);assert.equal(bad.selection.rejected.scope_change,1);
 const protectedResult=run(text,[edit('complete','finish',9)],{protected_terms:['complete']});assert.equal(protectedResult.rewritten,text);assert.equal(protectedResult.selection.rejected.protected_term,1);
});
test('repeated positive and negative contexts are not guessed or shifted',()=>{
 const text='They completed the first task but had not completed the second task before the meeting.';
 const r=run(text,[edit('completed','finished',1)]);assert.equal(r.rewritten,'They completed the first task but had not finished the second task before the meeting.');assert.equal(r.selection.alignedUnique,0);
 const bad=run(text,[edit('completed','finished',2)]);assert.equal(bad.rewritten,text);
});
test('absent source and invalid negative/fractional occurrence remain rejected',()=>{
 const text='We review the document before the meeting.';
 for(const n of [-1,.5,NaN]){const r=run(text,[edit('review','check',n)]);assert.equal(r.rewritten,text);assert.equal(r.selection.rejected.invalid_edit,1);}
 const r=run(text,[edit('Review','check',4)]);assert.equal(r.rewritten,text);assert.equal(r.selection.rejected.original_not_found,1);
});
test('prompt distinguishes per-original occurrence from edit list numbering',()=>{const p=buildPrompt('We review the document before the meeting.');for(const phrase of ['候補の配列内の通し番号','originalごとに独立','2件ともoccurrenceは0','左からの出現順を0,1,2'])assert(p.includes(phrase));});
test('Japanese unique phrase aligns higher indices without changing conjugation',()=>{
 const text='資料を慎重に確認してから、担当者に共有した。次の会議でも内容を説明する予定だ。';
 const r=run(text,[edit('慎重に','注意深く',6)]);assert.equal(r.edits.length,1);assert.equal(r.edits[0].occurrence,0);assert(r.rewritten.includes('注意深く確認してから'));
});
test('overlapping literal occurrences are not treated as unique',()=>{
 const text='The rehearsal included go go go before the group stopped for lunch.';
 const r=run(text,[edit('go go','move together',3)]);assert.equal(r.rewritten,text);assert.equal(r.selection.alignedUnique,0);assert.equal(r.selection.rejected.occurrence_out_of_range,1);
});
test('quote punctuation does not create a word-internal boundary',()=>{
 const text="We wrote 'review' in our notes before the long meeting.";
 const r=run(text,[edit('review','check',2)]);assert.equal(r.edits.length,1);assert(r.rewritten.includes("'check'"));
});
test('combining-mark graphemes cannot hide adjacent Latin word fragments',()=>{
 const text='We record cafe\u0301ine levels during the meeting and review the notes afterwards.';
 for(const [original,replacement] of [['cafe\u0301','coffee'],['ine','outside']]){const r=run(text,[edit(original,replacement,7)]);assert.equal(r.rewritten,text);assert.equal(r.selection.rejected.grammar_join,1);}
 const whole=run('We visit the cafe\u0301 before the meeting.',[edit('cafe\u0301','coffee shop',7)]);assert.equal(whole.edits.length,1);
});
