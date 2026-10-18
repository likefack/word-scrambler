import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const temp = mkdtempSync(join(tmpdir(), 'scrambler-presets-'));
after(() => rmSync(temp, { recursive: true, force: true }));
function transpile(name) {
  const source = readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  const output = join(temp, `${name}.mjs`);
  writeFileSync(output, js.replace(/(['"])\.\/(rewriter(?:-[a-z]+)*|presets(?:-[a-z]+)*)\1/g, (_,quote,name) => JSON.stringify(pathToFileURL(join(temp, `${name}.mjs`)).href)));
  return output;
}
for (const name of ['rewriter', 'rewriter-grammar', ...readdirSync(new URL('../lib/', import.meta.url)).filter(name => /^presets(?:-[a-z]+)*\.ts$/.test(name)).map(name => name.slice(0,-3))]) transpile(name);
const { applyModelOutput, changedWordCount, words } = await import(pathToFileURL(join(temp, 'rewriter.mjs')).href);
const { presetRewrite, classifyStyle, STYLE_DICTIONARIES } = await import(pathToFileURL(join(temp, 'presets.mjs')).href);

const samples = {
  ja: {
    business: 'いつもお世話になっております。\n先日ご相談した企画について、資料をまとめましたのでお送りいたします。今回の提案では、利用者の負担を減らし、より快適にサービスをご利用いただける仕組みを検討しております。\nお忙しいところ恐縮ですが、内容をご確認いただき、ご意見をいただけますと幸いです。',
    casual: '今日は少し早起きして、近所の公園を散歩した。\n朝の空気はひんやりしていて、歩いているうちに頭がすっきりしてきた。帰り道に小さなパン屋を見つけたので、焼きたてのパンを買って帰った。\n特別なことは何もなかったけれど、こんな穏やかな朝もいいなと思った。',
    academic: '植物が元気に育つためには、日光と水が欠かせません。\nただし、必要な水の量は植物の種類や季節によって異なります。土の表面が乾いているかを確認してから、水を与えることが大切です。\n毎日決まった量を与えるのではなく、植物の状態を観察しながら調整しましょう。',
  },
  en: {
    business: 'Thank you for your continued support.\nI have prepared the materials for the project we discussed and would appreciate your feedback. This proposal focuses on reducing the effort required from users and making the service more convenient.\nPlease review the document when you have a moment and let me know if you have any questions.',
    casual: 'I woke up a little earlier today and went for a walk in the nearby park.\nThe morning air was cool, and my mind felt clearer as I walked. On my way home, I found a small bakery and picked up some freshly baked bread.\nNothing special happened, but it was the kind of quiet morning I really enjoy.',
    academic: 'Plants need sunlight and water to grow well.\nHowever, the amount of water they require depends on the type of plant and the season. It is important to check whether the surface of the soil is dry before watering.\nRather than providing the same amount every day, observe the plant and adjust your routine accordingly.',
  },
};
for (const language of ['ja', 'en']) {
  for (const style of ['business', 'academic', 'casual']) {
    test(`${language}/${style}: distinct dictionary >=150 entries and nonzero natural sample edits`, () => {
      assert.ok(STYLE_DICTIONARIES[language][style].length >= 150);
      const text = samples[language][style];
      const classification = classifyStyle(text, language);
      assert.equal(classification.id, style);
      assert.ok(classification.confidence >= .25 && classification.confidence <= 1);
      assert.ok(classification.evidence.length > 0);
      const result = presetRewrite(text, language);
      assert.ok(result.edits.length > 0, JSON.stringify(result));
      assert.ok(result.changedWords <= Math.ceil(result.totalWords * .32));
      assert.equal(result.original, text);
      assert.equal(result.rewritten.split('\n').length, text.split('\n').length);
      assert.ok(result.notes.some(note => note.includes('AIの意味理解は行いません')));
      console.log(`${language}/${style}: ${result.edits.length} edits, ${result.ratio}%`, result.edits.map(e => `${e.original} → ${e.replacement}`).join(' / '));
    });
  }
}
test('deterministic output and manual override choose only their own dictionary', () => {
  const text = 'Please review the document. I really enjoy this a lot of the time, and I went for a walk today.';
  const business = presetRewrite(text, 'en', 'business');
  assert.deepEqual(business, presetRewrite(text, 'en', 'business'));
  assert.ok(business.rewritten.includes('kindly review') || business.rewritten.includes('Kindly review'));
  assert.ok(business.rewritten.includes('really enjoy'));
  const casual = presetRewrite(text, 'en', 'casual');
  assert.ok(casual.rewritten.includes('Please review'));
  assert.ok(casual.edits.some(edit => edit.original === 'really enjoy' || edit.original === 'went for a walk'));
});
test('preserves exact quoted text, URLs, emails, numbers and title-cased names', () => {
  const text = 'Please review "please confirm" and “please review” with Please Review in 2026. Visit https://example.com/please-review or email please.review@example.com. For example, meet For Example today. See `please review`.';
  const result = presetRewrite(text, 'en', 'business');
  for (const protectedText of ['"please confirm"', '“please review”', 'Please Review', '2026', 'https://example.com/please-review', 'please.review@example.com', 'For Example', '`please review`']) assert.ok(result.rewritten.includes(protectedText), protectedText);
});
test('does not match within words, hyphenated compounds or apostrophe-connected terms', () => {
  const text = 'Foretherefore and thereforeafter are not therefore. He prefers sort ofness and a little earlierish but today he went for a walkway.';
  const academic = presetRewrite(text, 'en', 'academic');
  assert.ok(academic.rewritten.includes('Foretherefore'));
  assert.ok(academic.rewritten.includes('thereforeafter'));
  const casual = presetRewrite(text, 'en', 'casual');
  for (const same of ['sort ofness', 'a little earlierish', 'went for a walkway']) assert.ok(casual.rewritten.includes(same));
});
test('preserves English sentence-initial and ALL CAPS casing and inflections', () => {
  const text = 'Please review the document before the meeting. PLEASE CONFIRM the details. I really enjoyed the walk yesterday.';
  const business = presetRewrite(text, 'en', 'business');
  assert.ok(business.rewritten.includes('Kindly review'));
  assert.ok(business.rewritten.includes('KINDLY CONFIRM'));
  const casual = presetRewrite(text, 'en', 'casual');
  assert.ok(casual.rewritten.includes('really liked'));
  assert.ok(!casual.rewritten.includes('really likeded'));
});
test('Japanese quotes, numbers, company names and nonmatching inflections stay intact', () => {
  const text = '今日は「とても楽しい」と言った。株式会社とても楽しいを見た。123円だった。とても楽しかったので、たくさん話した。';
  const result = presetRewrite(text, 'ja', 'casual');
  for (const protectedText of ['「とても楽しい」', '株式会社とても楽しい', '123']) assert.ok(result.rewritten.includes(protectedText));
  assert.ok(result.rewritten.includes('すごく楽しかった') || result.rewritten.includes('いっぱい話した'));
});
test('no dictionary matches produces honest unchanged result; classification may be uncertain', () => {
  const text = 'Zebras cross open fields.';
  const result = presetRewrite(text, 'en');
  assert.equal(result.rewritten, text);
  assert.equal(result.edits.length, 0);
  assert.ok(result.notes[0].includes('原文をそのまま'));
  assert.equal(classifyStyle(text, 'en').confidence, .25);
});
test('rejects empty and oversized input before attempting replacement', () => {
  assert.throws(() => presetRewrite('', 'en'));
  assert.throws(() => presetRewrite('word '.repeat(700), 'en'));
});
test('Japanese auxiliaries cannot attach to a replaced verb stem', () => {
  const cases = [
    ['ご検討いただきたいと思っています。ご参加いただきたいと考え、ご協力いただきたいと思います。', 'business'],
    ['研究結果に基づいている。また研究結果に基づいています。', 'academic'],
    ['この道具は欠かせないです。部屋はひんやりしていてほしいと思う。', 'academic'],
    ['今日は部屋がひんやりしていてほしいと思った。', 'casual'],
  ];
  for (const [text, style] of cases) assert.equal(presetRewrite(text, 'ja', style).rewritten, text);
  const valid = presetRewrite('ご協力いただきありがとうございます。ご検討いただきありがとうございます。', 'ja', 'business');
  assert.ok(valid.edits.length > 0);
});
test('English preposition tails and hyphenated terms are not broken by discourse replacements', () => {
  const cases = [
    ['We provide help in addition to advice at present rates and at this time of year.', 'business'],
    ['It changed as a result of rain in addition to wind.', 'academic'],
    ['I am trying to be honest at the moment of departure.', 'casual'],
    ['It was a really fun day and I do as well as I can.', 'casual'],
    ["A therefore-like phrase therefore's effect and pre-therefore are word compounds.", 'academic'],
  ];
  for (const [text, style] of cases) assert.equal(presetRewrite(text, 'en', style).rewritten, text);
});

test('English attributive adjectives never become duplicate-article phrases', () => {
  const input = 'I had a really fun day with my friends.';
  const result = presetRewrite(input, 'en', 'casual');
  assert.ok(!result.rewritten.includes('a a lot of fun'));
  assert.ok(result.rewritten.includes('a really fun day'));
});

test('expanded dictionaries contain unique, nonempty, changed source pairs', () => {
  let count = 0;
  for (const language of ['ja', 'en']) for (const style of ['business', 'academic', 'casual']) {
    const pairs = STYLE_DICTIONARIES[language][style];
    assert.equal(new Set(pairs.map(pair => pair[0])).size, pairs.length);
    assert.ok(pairs.every(([from,to]) => from.trim() && to.trim() && from !== to && !/[\r\n]/.test(from + to)));
    count += pairs.length;
  }
  assert.ok(count > 1000, `Expected broadly expanded inventories; got ${count}`);
});

test('orthography-only variants do not inflate lexical replacement coverage', () => {
  const groups = [['すでに','既に'],['あらためて','改めて'],['主に','おもに'],['概ね','おおむね'],['たとえば','例えば'],['すべて','全て'],['友達','友だち'],['おなか','お腹'],['ご飯','ごはん'],['子供','子ども'],['おいしい','美味しい'],['かわいい','可愛い'],['いっしょに','一緒に'],['たしかに','確かに']];
  for(const style of ['business','academic','casual']) for(const [from,to] of STYLE_DICTIONARIES.ja[style]) {
    assert.ok(!groups.some(group=>group.includes(from)&&group.includes(to)), `${from} -> ${to} is only a spelling change`);
  }
});

test('indefinite articles remain compatible with the replacement onset', () => {
  // General regression independent of the held-out evaluation corpus.
  for (const text of [
    'The team submitted an additional document after the meeting.',
    'The research described a significant difference between the two methods.',
    'We provided a concise summary of the project to the client.',
  ]) {
    const result = presetRewrite(text,'en','business');
    assert.doesNotMatch(result.rewritten,/\ba (?:additional|important|essential|abbreviated)\b/i);
    assert.doesNotMatch(result.rewritten,/\ban (?:brief|concise|significant|detailed)\b/i);
  }
});


test('unquoted names and mentioned expressions preserve their whole sentence conservatively', () => {
  for (const text of [
    '小さな店という名前のお店に行った。',
    '重要であるという言葉の使用頻度を数える。',
    'この場所の名前は小さな店ではない。',
    'The word important has a particular use in this document.',
    'The cafe is called really happy in the guide.',
  ]) {
    const language=/[あ-んア-ン]/.test(text)?'ja':'en';
    for (const style of ['business','academic','casual']) assert.equal(presetRewrite(text,language,style).rewritten,text);
  }
});


test('suru desire suffix is not mistaken for a completed past tense', () => {
  for (const text of ['調査を実施したいと考えている。','少し休憩したいと思った。','調査を実施したくないと考えている。','調査を実施したかったと考えている。','調査を実施したければ準備が要る。']) {
    const result=presetRewrite(text,'ja',text.startsWith('調査')?'academic':'casual');
    assert.doesNotMatch(result.rewritten,/行った(?:い|く|かっ|けれ)|休んだい|始めたいと考えていた/);
  }
});


test('result clauses retain verbs and quantified a-lot phrases retain their grammar', () => {
  const ja=presetRewrite('測定条件をそろえて比較した結果、差が見られた。','ja','academic');
  assert.doesNotMatch(ja.rewritten,/そろえて比較の結果/);
  const en=presetRewrite('I wasted quite a lot of time today.','en','casual');
  assert.doesNotMatch(en.rewritten,/quite lots of/);
  const named=presetRewrite('小さな店という人の名前の話じゃない。','ja','casual');
  assert.equal(named.rewritten,'小さな店という人の名前の話じゃない。');
});

test('displayed word counts use full-context segmentation and enforce the final budget', () => {
  const text = '家の掃除を少しした。それから静かな場所で本を読む。';
  const raw = {style:{label:'カジュアル',features:[],explanation:''},edits:[{original:'少し',replacement:'ちょっと',occurrence:0}],protected_terms:[],note:''};
  const result = applyModelOutput(text,raw);
  assert.equal(result.rewritten,'家の掃除をちょっとした。それから静かな場所で本を読む。');
  assert.notEqual(changedWordCount('少し','ちょっと'),changedWordCount(text,result.rewritten));
  assert.equal(result.changedWords,changedWordCount(text,result.rewritten));
  assert.equal(result.totalWords,words(text).length);
  assert.equal(result.ratio,Math.round(result.changedWords/result.totalWords*1000)/10);
  const short = 'もう少しした。';
  const capped = applyModelOutput(short,raw);
  assert.ok(capped.changedWords <= Math.ceil(words(short).length*.32));
  assert.equal(capped.changedWords,changedWordCount(short,capped.rewritten));
  for(const language of ['ja','en']) for(const style of ['business','academic','casual']) {
    const sample=presetRewrite(samples[language][style],language,style);
    assert.equal(sample.changedWords,changedWordCount(sample.original,sample.rewritten));
  }
});

test('AI unique phrase with one-based occurrence can be aligned without fuzzy matching', () => {
  const source='今日は少し早起きして、近所の公園を散歩した。朝の空気はひんやりしていた。';
  const raw={style:{label:'日常語',features:[],explanation:'入力文の説明'},protected_terms:[],note:'',edits:[{original:'散歩した',replacement:'歩いた',occurrence:1}]};
  const strict=applyModelOutput(source,raw);
  assert.equal(strict.edits.length,0);assert.equal(strict.selection.rejected.occurrence_out_of_range,1);
  const aligned=applyModelOutput(source,raw,{alignUniqueOccurrence:true});
  assert.equal(aligned.edits.length,1);assert.equal(aligned.edits[0].occurrence,0);assert.equal(aligned.selection.alignedUnique,1);
  assert.equal(aligned.changedWords,changedWordCount(source,aligned.rewritten));
  const absent=applyModelOutput(source,{...raw,edits:[{original:'存在しない語',replacement:'別の語',occurrence:1}]},{alignUniqueOccurrence:true});
  assert.equal(absent.edits.length,0);assert.equal(absent.selection.rejected.original_not_found,1);
});
test('AI repeated phrases retain exact zero-based selection and never guess out-of-range indices',()=>{
  const source='I enjoy a quiet morning and a quiet evening with my friends.';
  const base={style:{label:'日常語',features:[],explanation:'説明'},protected_terms:[],note:''};
  const valid=applyModelOutput(source,{...base,edits:[{original:'quiet',replacement:'peaceful',occurrence:1}]},{alignUniqueOccurrence:true});
  assert.equal(valid.rewritten,'I enjoy a quiet morning and a peaceful evening with my friends.');assert.equal(valid.selection.alignedUnique,0);
  const invalid=applyModelOutput(source,{...base,edits:[{original:'quiet',replacement:'peaceful',occurrence:2}]},{alignUniqueOccurrence:true});
  assert.equal(invalid.edits.length,0);assert.equal(invalid.selection.rejected.occurrence_out_of_range,1);
});
test('AI zero accepted candidates exposes reason counts without source phrases or key material',()=>{
  const source='今日は少し早起きして、近所の公園を散歩した。朝の空気はひんやりしていた。';
  const raw={style:{label:'日常語',features:[],explanation:'入力文の説明'},protected_terms:['散歩した'],note:'',edits:[{original:'散歩した',replacement:'歩いた',occurrence:0},{original:'原文に存在しない',replacement:'別の語',occurrence:0}]};
  const result=applyModelOutput(source,raw,{alignUniqueOccurrence:true});
  assert.equal(result.changedWords,0);assert.equal(result.selection.proposed,2);assert.equal(result.selection.accepted,0);assert.equal(result.selection.protectedTerms,1);
  assert.deepEqual(result.selection.rejected,{protected_term:1,original_not_found:1});
  assert.ok(!JSON.stringify(result.selection).includes('散歩'));
});
test('AI candidate summary accounts for accepted, rejected and capped candidates',()=>{
  const source='We carefully review the document and prepare the report before the meeting.';
  const result=applyModelOutput(source,{style:{label:'business',features:[],explanation:''},protected_terms:[],note:'',edits:[{original:'review',replacement:'check',occurrence:0},{original:'review',replacement:'inspect',occurrence:0},{original:'missing',replacement:'absent',occurrence:0},{original:'document',replacement:'document',occurrence:0}]},{maxEdits:3});
  const q=result.selection;assert.equal(q.proposed,q.accepted+Object.values(q.rejected).reduce((a,b)=>a+b,0));
  assert.equal(q.rejected.overlap,1);assert.equal(q.rejected.original_not_found,1);assert.equal(q.rejected.limit,1);
});
test('honorific prefixes are not stranded by a partial lexical substitution',()=>{
 for(const style of ['business','academic','casual']){const result=presetRewrite('現時点の状況をご報告します。','ja',style);assert(!result.rewritten.includes('ご伝え'));assert(result.rewritten.includes('ご報告します'));}
});
test('physical viewpoint is not replaced by an abstract perspective',()=>{
 for(const style of ['business','academic','casual'])assert(presetRewrite('撮影では視点の高さと画角を考慮する。','ja',style).rewritten.includes('視点の高さ'));
});
test('Japanese connective candidates do not replace a compound postposition',()=>{
 for(const style of ['business','academic','casual'])for(const input of ['費用に加えて、作業時間も記録する。','結果を記録した。費用に加えて、作業時間も記録する。']){
  const result=presetRewrite(input,'ja',style);assert(result.rewritten.includes('に加えて、'));assert(!result.rewritten.includes('にさらに、'));
 }
 const result=presetRewrite('加えて、作業時間も記録する。','ja','academic');assert(result.rewritten.startsWith('さらに、'));
});
