/**
 * Isolated development fixtures, not a held-out efficacy benchmark.
 * Run: node tests/presets-ja-core.sanity.mjs
 * Existing modules are loaded into memory; no production engine is modified.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleUrls = new Map();
function localModuleUrl(relative) {
  const filename = path.resolve(root, relative);
  if (moduleUrls.has(filename)) return moduleUrls.get(filename);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0, `Transpile diagnostics: ${relative}`);
  const output = compiled.outputText.replace(/from (['"])(\.{1,2}\/[^'"]+)\1/g, (_, quote, dependency) => {
    const dependencyFile = path.resolve(path.dirname(filename), dependency + (path.extname(dependency) ? '' : '.ts'));
    return `from ${JSON.stringify(localModuleUrl(path.relative(root, dependencyFile)))}`;
  });
  const url = 'data:text/javascript;base64,' + Buffer.from(output).toString('base64');
  moduleUrls.set(filename, url);
  return url;
}
const { JA_CORE } = await import(localModuleUrl('lib/presets-ja-core.ts'));
const { changedWordCount } = await import(localModuleUrl('lib/rewriter.ts'));
const { STYLE_DICTIONARIES, presetRewrite } = await import(localModuleUrl('lib/presets.ts'));
const padding = '野原には草が茂り、海岸には白波が立っていた。村には誰も住んでいなかった。'.repeat(6);
const saved = Object.fromEntries(Object.keys(JA_CORE).map(style => [style, STYLE_DICTIONARIES.ja[style]]));
const counts = {};
let isolated = 0;
const failures = [];
for (const [style, pairs] of Object.entries(JA_CORE)) {
  assert.equal(new Set(pairs.map(([source]) => source)).size, pairs.length, `${style}: duplicate source`);
  for (const [source, target] of pairs) {
    assert.ok(source && target && source !== target, `${style}: empty/no-op`);
    assert.ok(source.length < 50 && target.length < 70, `${style}: overlong template`);
    assert.ok(!/[0-9０-９\n]/u.test(source + target), `${style}: number/newline`);
    const localChangeCount = changedWordCount(source, target);
    if (!localChangeCount) failures.push(`${style}: no changed source word: ${source} -> ${target}`);
    STYLE_DICTIONARIES.ja[style] = [[source, target]];
    const input = source + '。' + padding;
    const result = presetRewrite(input, 'ja', style);
    if (result.rewritten !== target + '。' + padding) failures.push(`${style}: boundary/matching: ${source} -> ${result.rewritten.slice(0, target.length + 6)}`);
    assert.equal(result.changedWords, changedWordCount(input, result.rewritten), `${style}: full-document numerator`);
    isolated++;
  }
  counts[style] = pairs.length;
  STYLE_DICTIONARIES.ja[style] = [...new Map([...saved[style], ...pairs].map(pair => [pair[0], pair])).values()];
}
assert.deepEqual(failures, [], 'All entries must match the actual engine and change a source word.');
const fixtures = [
  ['business', '資料を購入したいと思います。', '資料を買いたいと思います。'],
  ['business', '資料を購入したくないと思います。', '資料を買いたくないと思います。'],
  ['business', '資料を購入したくなかった。', '資料を買いたくなかった。'],
  ['business', '資料を購入しなかった。', '資料を買わなかった。'],
  ['business', '資料を購入しなければならない。', '資料を買わなければならない。'],
  ['business', '資料を購入しておきます。', '資料を買っておきます。'],
  ['business', '資料を購入している。', '資料を買っている。'],
  ['business', '資料を購入してから帰る。', '資料を買ってから帰る。'],
  ['business', '資料を購入すればよかった。', '資料を買えばよかった。'],
  ['business', '資料を購入しませんでした。', '資料を買いませんでした。'],
  ['business', '資料を購入したり読んだりした。', '資料を買ったり読んだりした。'],
  ['academic', '記録を収集している。', '記録を集めている。'],
  ['business', '資料を収集し、部屋に置きます。', '資料を集め、部屋に置きます。'],
  ['business', '彼に質問をしたいと思います。', '彼に尋ねたいと思います。'],
  ['academic', '回答をしなければならない。', '答えなければならない。'],
  ['academic', '記録を収集しつつ待つ。', '記録を集めつつ待つ。'],
  ['academic', '記録を収集したいとは思わない。', '記録を集めたいとは思わない。'],
  ['academic', '記録を収集しないと決めた。', '記録を集めないと決めた。'],
  ['academic', '記録を収集しなくてもよい。', '記録を集めなくてもよい。'],
  ['academic', '記録を収集したくなくても、命令には逆らえない。', '記録を集めたくなくても、命令には逆らえない。'],
  ['academic', '情報を取得した結果、仮説が変わった。', null],
  ['academic', '容易でないこともある。', '簡単でないこともある。'],
  ['academic', '容易ではなかった。', '簡単ではなかった。'],
  ['casual', '友人としゃべっている。', '友人と話している。'],
  ['casual', '友人としゃべりたくなかった。', '友人と話したくなかった。'],
  ['casual', 'まだ眠りたくない。', 'まだ寝たくない。'],
  ['casual', '意外にも空席があった。', '案外にも空席があった。'],
  ['casual', '雨に気づいている。', '雨に気がついている。'],
];
// Check each family with the isolated core inventory to prevent unrelated old
// alternatives from hiding or colliding with the grammatical expectation.
for (const [style, before, expected] of fixtures) {
  STYLE_DICTIONARIES.ja[style] = JA_CORE[style];
  const result = presetRewrite(before + padding, 'ja', style);
  if (expected !== null) assert.equal(result.rewritten, expected + padding, `${style}: ${before}`);
  assert.equal(result.changedWords, changedWordCount(before + padding, result.rewritten));
  STYLE_DICTIONARIES.ja[style] = [...new Map([...saved[style], ...JA_CORE[style]].map(pair => [pair[0], pair])).values()];
}
const unchanged = [
  ['business', '作業手順を読むことにした。'],
  ['business', 'あらかじめご了承ください。'],
  ['business', 'この記録を再確認することにした。'],
  ['business', '明日から三日後でよければ行きます。'],
  ['business', 'その意味を受け取る。'],
  ['business', '全員の位置を把握する。'],
  ['business', '説明がつかない。'],
  ['business', '本を再購入した。'],
  ['business', '再選択したい。'],
  ['academic', '推測と実測に差がある。'],
  ['academic', '明日は仮説を再検証する。'],
  ['casual', '彼の自宅で待つ。'],
  ['casual', '田中さんの自宅にいた。'],
  ['casual', 'ゆったりした服を着る。'],
  ['casual', '代金はいくらか。'],
  ['casual', 'なるべくなら休みたい。'],
  ['casual', '彼が快く引き受けた。'],
  ['casual', 'もう一度考え直す。'],
  ['casual', 'もう一度やり直した。'],
  ['casual', 'とても買えないと思った。'],
  ['business', 'この機能は入力を支援する。'],
  ['business', 'あいにくな天気だった。'],
  ['business', '私は担当者です。'],
  ['casual', '景色を眺める。'],
  ['casual', '行く理由がない。'],
];
for (const [style, text] of unchanged) {
  STYLE_DICTIONARIES.ja[style] = JA_CORE[style];
  assert.equal(presetRewrite(text + padding, 'ja', style).rewritten, text + padding, `${style}: unsafe lexical attachment: ${text}`);
  STYLE_DICTIONARIES.ja[style] = [...new Map([...saved[style], ...JA_CORE[style]].map(pair => [pair[0], pair])).values()];
}
for (const style of Object.keys(JA_CORE)) {
  for (const text of [
    '「資料を購入したい。予測する。重要だった。」',
    '株式会社購入するで働く。',
    '購入するという名前の会社へ行った。',
    '「気がつく」という表現を数える。',
    'https://example.org/購入する user@example.org `購入する` 2026/10/18 １２３。',
  ]) {
    const result = presetRewrite(text + padding, 'ja', style);
    assert.ok(result.rewritten.startsWith(text), `${style}: protected data changed: ${text}`);
    assert.equal(result.changedWords, changedWordCount(text + padding, result.rewritten));
    assert.ok(result.changedWords <= Math.max(1, Math.ceil(result.totalWords * .32)));
  }
}
const developmentParagraphs = [
  ['business', '備品を購入する前に、必要な数を予測しておきます。担当者は資料を収集し、費用の内訳を説明します。作業を停止する場合は、利用者にその理由を伝えます。'],
  ['business', '近いうちに記録を返却します。長期間の保管に際しては、各自の持ち物と区別してください。明確でない点は質問し、後で回答を受け取ります。'],
  ['business', '今までの準備を継続しながら、不具合を修繕します。追加で購入したいものがあれば、担当者へお知らせください。手段の違いと費用は資料に記載しました。'],
  ['academic', '道具を用いて材料を計測する。長時間の作業で誤差が増加したため、不要な記録を削除した。重要な点は、同じ手段で確かめられるかどうかである。'],
  ['academic', '原因を予想してから事例を収集する。手がかりが得られても、それだけで結論を述べることはできない。相違の根拠を示し、説明を補足する必要がある。'],
  ['academic', '装置を接続すると出力が増加する。動作を停止しても、短時間は熱が残る。重要ではなかった条件も記載しておき、情報を受信した時点を確かめる。'],
  ['casual', '昨日は友人としゃべって、帰る前に昼食を買った。公園の景色を眺めながら、前より疲れにくくなったことに気づいた。家では短時間だけ眠ってから、明日の用意をした。'],
  ['casual', '朝食のあとに出かけようと思ったけれど、雨が降っていた。予定をどうにかするために友人へ返答した。全部を準備しなくても、ひとまず待つことにした。'],
  ['casual', '彼の自宅にはゆったりした服があった。代金はいくらか尋ねたが、とても買えないと思った。もう一度考え直して、のんびり過ごした。'],
];
for (const [style, input] of developmentParagraphs) {
  const result = presetRewrite(input, 'ja', style);
  assert.equal(result.changedWords, changedWordCount(input, result.rewritten));
  assert.ok(result.changedWords <= Math.max(1, Math.ceil(result.totalWords * .32)));
  assert.doesNotMatch(result.rewritten, /買ったく|買ったい|行ったい|とてもすごく|自分の自分の|のんびりした服|少しか尋ね|時間をかけてと|眺めを眺め/);
  if (process.env.CORE_SHOW_DEV) console.log(JSON.stringify({ style, input, output: result.rewritten, changedWords: result.changedWords, totalWords: result.totalWords }));
}
console.log(JSON.stringify({ counts, isolated, grammaticalFixtures: fixtures.length, rejectedAmbiguityFixtures: unchanged.length, protectionFixtures: 15, developmentParagraphs: developmentParagraphs.length, status: 'PASS' }, null, 2));
