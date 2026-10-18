/** Author-created development prose, not independent holdout evaluation.
 * node tests/presets-ja-expanded.dev.mjs [baseline-dictionary.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = new Map();
function moduleUrl(relative) {
  const file = path.resolve(root, relative);
  if (cache.has(file)) return cache.get(file);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/from (['"])(\.{1,2}\/[^'"]+)\1/g, (_, quote, dep) => `from ${JSON.stringify(moduleUrl(path.relative(root, path.resolve(path.dirname(file), dep + (path.extname(dep) ? '' : '.ts')))))}`);
  const url = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');
  cache.set(file, url);
  return url;
}
const {JA_EXPANDED} = await import(moduleUrl('lib/presets-ja-expanded.ts'));
const {STYLE_DICTIONARIES, presetRewrite} = await import(moduleUrl('lib/presets.ts'));
export const DEVELOPMENT_TEXTS = {
  business: [
    '来月の説明会について、会場の設備を確認しました。参加者が使いやすいように、案内図を新たに作成しています。受付は開始時刻の前に設置し、不要な荷物は別の場所に移します。ご質問がありましたら担当までお知らせください。',
    '納品に向けた準備はほぼ完了しています。一部の部品はまだ届いていませんが、担当者が状況を調べています。追加の変更が必要な場合には、費用と納期への影響を確認してから判断します。',
    '研修では、初めて使用する人にもわかりやすい資料を用います。説明がわかりにくかった箇所は、受講者の意見を参考に修正します。実施後も記録を保ち、次回の担当者に引き継ぐ予定です。',
    '今回の予算案は各部門の見積もりを参考にしています。特に大きな支出については、担当部署と再度協議します。十分な時間を確保し、可能な範囲で早めに回答をお願いします。',
    '従来の書式を引き続き使用しますが、記入が困難な項目は空欄でも構いません。内容が明確な申請から順番に審査を進めます。詳細な手続きは添付文書をご覧ください。',
    'お客様からいただいたご指摘をもとに、画面の表示を改善しました。操作の途中でも保存が可能になりました。担当者が動作を確認し、わかりやすい案内を準備してから公開します。',
  ],
  academic: [
    '本調査は図書館の利用記録を対象とする。資料の種類ごとに利用回数を調べたところ、分布には明確な違いがあった。単純な平均だけでは詳細な傾向を把握することが困難なため、時期ごとの値も比較した。',
    '実験では異なる温度で材料を加熱し、形状の変化を確認した。温度を一定に保つために同一の装置を用いた。観測値は次第に安定したが、短い時間だけでは確かな結論を出すことはできない。',
    '交通量は曜日によって変化する。雨天時には多くの車両が同時に交差点へ進入し、待ち時間が増加した。調査範囲は限定されており、地域の特性を考慮することが必要である。',
    '回答者は文章を読んだ後に内容を説明する課題に取り組んだ。図を使用した場合、理解しやすいと評価した人数は増えた。しかし、正答率の違いは小さく、効果があるとは断定できない。',
    '資料には複数の表記が混在している。まず原本を確認し、各々の記述を比較する。後から加筆された箇所は別々に整理した。既に失われた部分については、関連する記録を用いて検討する。',
    'この手法では計算を段階に分けて実施する。不要な処理を省略し、必要な値だけを保持することで、全体の処理時間を短縮できる。広範な条件で確認することが今後の検討事項となる。',
  ],
  casual: [
    '昨日は友達と映画を見に行った。途中の場面が少しわかりにくかったけれど、最後まで見たら意味がわかった。帰りは駅でごはんを食べて、最近読んだ本のことをいろいろ話した。',
    '家でカレーを作ったら、思ったより辛くなった。子どもはお水を飲みながら少しずつ食べていた。残りは明日のお昼にするつもり。ちゃんと味を確かめてから香辛料を入れればよかった。',
    '電車の中で忘れ物に気づいて、いきなり慌ててしまった。かばんを調べたら奥に入っていたので安心した。こんなときは落ち着くのが大事だとわかっているけど、なかなか難しい。',
    'このごろ運動を続けている。最初は体が重かったけれど、少しずつ長い距離を歩けるようになった。今日は途中で休憩して、水を飲んだ。無理をせずに続けられたらいいなと思う。',
    '久々に部屋の模様替えをした。机の位置を変えるだけでも、ずいぶん広く感じる。おうちにいる時間がもっと楽しくなりそう。使いやすい棚があればいいけれど、とりあえず今のものを使おう。',
    'さっき友だちから電話があった。週末の集まりは場所が変わるらしい。どれくらい時間がかかるか調べておこうと思う。たぶんバスで行けるけど、帰りの便も先に確かめておきたい。',
  ],
};
const snapshot = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : null;
const current = Object.fromEntries(Object.keys(JA_EXPANDED).map(style=>[style,[...STYLE_DICTIONARIES.ja[style]]]));
const newSources = Object.fromEntries(Object.entries(JA_EXPANDED).map(([style,pairs])=>[style,new Set(pairs.map(([source])=>source))]));
function evaluate(dictionary) {
  for (const style of Object.keys(JA_EXPANDED)) {
    STYLE_DICTIONARIES.ja[style] = [...new Map([...current[style].filter(([source])=>!newSources[style].has(source)),...dictionary[style]].map(pair=>[pair[0],pair])).values()];
  }
  const output = {};
  let total = 0, changed = 0;
  for (const [style, texts] of Object.entries(DEVELOPMENT_TEXTS)) {
    const results = texts.map(text=>presetRewrite(text,'ja',style));
    const words = results.reduce((sum,result)=>sum+result.totalWords,0);
    const edits = results.reduce((sum,result)=>sum+result.changedWords,0);
    output[style] = { cases:texts.length, totalWords:words, changedWords:edits, ratio: +(100*edits/words).toFixed(2), rewritten:results.map(result=>result.rewritten) };
    total+=words; changed+=edits;
  }
  output.overall = { totalWords:total, changedWords:changed, ratio:+(100*changed/total).toFixed(2) };
  return output;
}
if (process.env.SAVE_BASELINE) fs.writeFileSync(process.env.SAVE_BASELINE, JSON.stringify(JA_EXPANDED));
console.log(JSON.stringify({before:snapshot?evaluate(snapshot):null,after:evaluate(JA_EXPANDED)},null,2));
