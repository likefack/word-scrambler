/** Run with: node tests/presets-ja-expanded.sanity.mjs
 * Structural and engine-compatibility checks, not a quality/efficacy benchmark.
 * All sentences below are isolated regression fixtures created for this file.
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
const { JA_EXPANDED } = await import(localModuleUrl('lib/presets-ja-expanded.ts'));
const { changedWordCount } = await import(localModuleUrl('lib/rewriter.ts'));
const { STYLE_DICTIONARIES, presetRewrite } = await import(localModuleUrl('lib/presets.ts'));

const padding = 'ここには置き換えの候補とは無関係な文章を入れて、変更量の上限を十分に確保する。'.repeat(8);
const counts = {};
let individualChecks = 0;
for (const [style, pairs] of Object.entries(JA_EXPANDED)) {
  assert.ok(pairs.length >= 120, `${style}: expected at least 120 alternatives`);
  assert.equal(new Set(pairs.map(([source]) => source)).size, pairs.length, `${style}: duplicate source`);
  const originals = STYLE_DICTIONARIES.ja[style];
  for (const [source, target] of pairs) {
    assert.ok(source && target && source !== target, `${style}: empty/no-op pair`);
    assert.ok(source.length <= 160 && target.length <= 200, `${style}: overlong pair`);
    assert.ok(changedWordCount(source, target) > 0, `${style}: insertion-only edit: ${source}`);
    assert.ok(!/[0-9０-９\n]/.test(source + target), `${style}: numeric/newline edit`);
    STYLE_DICTIONARIES.ja[style] = [[source, target]];
    const text = `${source}。${padding}`;
    const result = presetRewrite(text, 'ja', style);
    assert.equal(result.edits.length, 1, `${style}: entry cannot match at word boundaries: ${source}`);
    assert.equal(result.rewritten, `${target}。${padding}`, `${style}: unexpected replacement: ${source}`);
    individualChecks++;
  }
  STYLE_DICTIONARIES.ja[style] = [...new Map([...originals, ...pairs].map(pair => [pair[0], pair])).values()];
  counts[style] = pairs.length;
}

const expectations = [
  ['business', '作業手順を読むことにした。', '作業手順を読むことにした。'],
  ['business', 'あらかじめご了承ください。', 'あらかじめご了承ください。'],
  ['business', 'この記録を再確認することにした。', 'この記録を再確認することにした。'],
  ['academic', 'この調査を実施したいと考えている。', ['この調査を実施したいと考えている。', 'この調査を行いたいと考えている。']],
  ['business', 'この操作は容易になるだろう。', 'この操作は簡単になるだろう。'],
  ['business', 'この条件が困難なら考え直す。', 'この条件が困難なら考え直す。'],
  ['casual', '山田ちゃんと話すことにした。', ['山田ちゃんと話すことにした。', '山田ちゃんとしゃべることにした。']],
  ['casual', 'この写真をとっても意味がない。', 'この写真をとっても意味がない。'],
  ['business', 'ご検討いただきたいと思います。', 'ご検討いただきたいと思います。'],
  ['academic', 'この説明は記録に基づいている。', 'この説明は記録に基づいている。'],
  ['business', 'ここで十分になるまで継続している。', 'ここで十分になるまで継続している。'],
  ['academic', 'この課題を主としている。', 'この課題を主としている。'],
  ['academic', 'この作業は必要とされる。', 'この作業は必要とされる。'],
  ['academic', 'この要素は変化に影響を与えなかった。', 'この要素は変化に影響を及ぼさなかった。'],
  ['academic', 'この要素は変化に関係しない。', 'この要素は変化に関連しない。'],
  ['casual', '少し待っていたら電話が鳴った。', 'ちょっと待っていたら電話が鳴った。'],
  ['casual', '家に戻っていたら電話が鳴った。', '家に帰っていたら電話が鳴った。'],
];
const regressionFailures = [];
for (const [style, before, after] of expectations) {
  const result = presetRewrite(before + padding, 'ja', style);
  const allowed = Array.isArray(after) ? after : [after];
  if (!allowed.some(prefix => result.rewritten.startsWith(prefix))) regressionFailures.push(`${style}: grammatical regression: ${result.rewritten.slice(0, 70)}`);
}
assert.deepEqual(regressionFailures, [], 'Grammatical regression checks');
for (const style of Object.keys(JA_EXPANDED)) {
  const protectedText = '「方法を確認します。少し待ってください。」 `概要` https://example.org/方法 user@example.org 2026/10/18 １２３。';
  const result = presetRewrite(protectedText + padding, 'ja', style);
  assert.ok(result.rewritten.startsWith(protectedText), `${style}: changed protected data`);
  assert.ok(result.changedWords <= Math.max(1, Math.ceil(result.totalWords * .32)), `${style}: budget exceeded`);
}
console.log(JSON.stringify({ counts, individualChecks, regressionChecks: expectations.length, protectedChecks: 3, status: 'PASS' }, null, 2));
