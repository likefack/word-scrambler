import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Exercise the current engine without changing its source or its dictionaries
// on disk. These authored examples are development checks, not a blind corpus.
const root = path.resolve(import.meta.dirname, '..');
const externalRequire = createRequire(import.meta.url);
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loadedModule = { exports: {} };
  cache.set(filename, loadedModule);
  let source = fs.readFileSync(filename, 'utf8');
  if (filename === path.join(root, 'lib/presets.ts')) source += '\nexport const __CORE_SANITY_BASE__ = BASE_DICTIONARIES;';
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0, filename);
  const localRequire = specifier => specifier.startsWith('.')
    ? load(path.relative(root, path.resolve(path.dirname(filename), `${specifier}.ts`)))
    : externalRequire(specifier);
  new Function('exports', 'require', 'module', compiled.outputText)(loadedModule.exports, localRequire, loadedModule);
  return loadedModule.exports;
}
const { EN_CORE } = load('lib/presets-en-core.ts');
const engine = load('lib/presets.ts');
const { EN_EXPANDED } = load('lib/presets-en-expanded.ts');
const baseline = Object.fromEntries(Object.entries(engine.__CORE_SANITY_BASE__.en).map(([style, pairs]) => {
  const seen = new Set();
  const original = [...pairs, ...EN_EXPANDED[style]].filter(([source]) => {
    if (seen.has(source)) return false;
    seen.add(source);
    return true;
  });
  engine.STYLE_DICTIONARIES.en[style] = original;
  return [style, original];
}));
const summaries = {};
for (const [style, pairs] of Object.entries(EN_CORE)) {
  const seen = new Set();
  const oldKeys = new Set(baseline[style].map(([source]) => source));
  for (const pair of pairs) {
    assert.equal(pair.length, 2);
    const [source, target] = pair;
    assert(source.trim() && target.trim());
    assert.equal(source, source.trim());
    assert.equal(target, target.trim());
    assert.equal(source, source.toLowerCase());
    assert.notEqual(source, target);
    assert(!seen.has(source), `${style}: duplicate ${source}`);
    assert(!/\s{2}/.test(`${source}${target}`));
    seen.add(source);
  }
  summaries[style] = { entries: pairs.length, genuinelyNewSources: pairs.filter(([source]) => !oldKeys.has(source)).length };
}
const development = [
  ['business', 'Our maintenance team has inspected the equipment and found several faults in the cooling system. The supplier will send the replacement parts tomorrow. We need to finish the work before the building opens on Monday. Employees should report any unusual noise to the supervisor and avoid the storage room while repairs are underway. We can begin the training after lunch. The session will explain how to use the new controls and what to do if the alarm sounds. Please keep the entrance clear so deliveries can reach the rear doors.'],
  ['business', 'The office move will happen in stages so our customers can continue to reach us. Each week, a different group will pack its files and check the inventory. We have purchased the equipment and requested permission to use the loading area. Some staff members will need help with the new telephone system. The relocation guide includes a simple explanation of the steps involved. Please verify that your contact details are correct and notify us if anything is missing. We appreciate your assistance with this lengthy process.'],
  ['business', 'The supplier has offered an inexpensive alternative to the original packaging. Buyers may request a sample before placing an order. Our team will evaluate the material and conduct a test under ordinary shipping conditions. The purpose is to reduce damage without adding weight or creating more waste. We want a sturdy box that can hold fragile products securely. A concise report will describe the results and any shortcomings. Once the review is complete, we can determine whether a larger order would be worthwhile.'],
  ['academic', 'Water moves through a landscape in several ways. Some flows over the surface, while some enters the soil and reaches deeper layers. The speed of movement depends on the structure of the ground, the slope of the land and the amount of rain. Researchers collect data at different locations to find out how these conditions influence the movement of water. Measurements taken after a storm can reveal changes that are difficult to see during dry weather. A simple explanation may overlook the connections between processes operating at different scales.'],
  ['academic', 'Children learn new words through repeated encounters in meaningful situations. They hear familiar expressions, notice differences and gradually connect sounds with objects or actions. A teacher can improve understanding by offering examples and asking questions. The method used in a classroom may depend on the age of the learners and their previous experience. To examine this relationship, investigators conducted interviews and gathered information from several schools. They attempted to determine whether the same technique would work in other settings. The results should be interpreted with care because the groups were not identical.'],
  ['academic', 'A network can remain useful even when individual components fail. Designers often include more than one route so that information has another way to reach its destination. This approach requires additional resources, but it can make the system more dependable. An important question is how much redundancy is necessary for the intended purpose. A large improvement in reliability may come from a small adjustment to the structure. To verify that a proposed design meets the requirements, engineers perform tests and inspect the connections under different conditions.'],
  ['casual', 'I had a busy morning because the washing machine stopped working just as I was getting ready to leave. I called someone to inspect it and spent the rest of the morning clearing space in the kitchen. After lunch, I went to a nearby shop for a few supplies and picked up a gift for my cousin. The shopkeeper was courteous and helped me find an inexpensive option. I was pleased with what I chose. Back at home, I made dinner and watched a movie while the rain tapped against the window.'],
  ['casual', 'We decided to take a bike ride along the river before breakfast. The path was quiet, although there were a few people walking their dogs. I had forgotten how pleasant it could be to spend time outdoors without checking my phone. We stopped at a cafe with a roomy terrace and ordered something tasty. My friend told me about a strange dream and we laughed for ages. On the way back, we began to plan another trip. I felt tired by the time we reached home, but I was glad we had gone.'],
  ['casual', 'I have been trying to read more in the evenings. Some nights I only manage a few pages, especially after a lengthy day at work. Yesterday I found a book that was hard to put down. The story follows a family as they move to a different city and begin a new life. There are some amusing scenes, but it also deals with serious questions about friendship and belonging. I took a break to prepare dinner, then returned to the sofa and kept reading until I realized how late it was.'],
];
const before = development.map(([style, text]) => engine.presetRewrite(text, 'en', style));
for (const style of Object.keys(EN_CORE)) {
  const seen = new Set();
  engine.STYLE_DICTIONARIES.en[style] = [...baseline[style], ...EN_CORE[style]].filter(([source]) => {
    if (seen.has(source)) return false;
    seen.add(source);
    return true;
  });
}
const after = development.map(([style, text]) => engine.presetRewrite(text, 'en', style));
const rows = development.map(([style], i) => ({ style, before: before[i].ratio, after: after[i].ratio }));
console.log(JSON.stringify({ summaries, development: rows, meanBefore: before.reduce((sum, r) => sum + r.ratio, 0) / before.length, meanAfter: after.reduce((sum, r) => sum + r.ratio, 0) / after.length }, null, 2));
if (process.argv.includes('--show-text')) {
  after.forEach((result, index) => { console.log(`\n${index + 1} ${development[index][0]}\n${result.rewritten}\n${JSON.stringify(result.edits)}`); });
}

const padding = ' The room has a table and four chairs beside the window. We will return on Monday and put everything back in its place before we leave.';
const rewrite = (text, style = 'academic') => engine.presetRewrite(text + padding, 'en', style).rewritten;
// Inflection, complements, tense and count/mass regression checks.
for (const style of Object.keys(EN_CORE)) {
  for (const text of [
    'We have started the task and have commenced the analysis.',
    'We had visited my family and had watched a movie.',
    'The drawing has illustrated why the water moves this way.',
    'He has had a shower and the room has a bath.',
    'The results suggest that the treatment might help.',
    'The states that the policy excludes have filed a complaint.',
    'The venue will open within a few days.',
    'She is entertaining a proposal and has a miserable cold.',
    'Do not weary him with questions. The doctor discussed irritable bowel syndrome. We ordered a prepared dinner.',
  ]) {
    const output = rewrite(text, style);
    assert(!/\b(?:have|has|had) (?:began|saw|showed|took|went)\b/.test(output), output);
    assert(!/\broom (?:takes|took) a (?:bath|shower)\b/.test(output), output);
    assert(!/\bresults propose\b|\bsays that the policy excludes\b|\bamusing a proposal\b|\bunhappy cold\b/.test(output), output);
  }
  const phraseTraps = 'We are working between now and then. These events may happen sooner or later than expected. We need support for some time zones. It worked because of course she had prepared. I was at your convenience store. She stood at that moment of triumph. Please enable airplane mode.';
  const phraseOutput = rewrite(phraseTraps, style);
  for (const phrase of ['between now and then', 'sooner or later than', 'for some time zones', 'because of course', 'at your convenience store', 'at that moment of triumph', 'airplane mode']) assert(phraseOutput.includes(phrase), `${style}: ${phraseOutput}`);
  const countAndTerms = 'Information is scarce. Feedback is welcome. The advice was clear. The nervous system has a complex number in its description. Simple interest differs from compound interest. The program has an empty string. The sample is statistically significant.';
  const output = rewrite(countAndTerms, style);
  for (const phrase of ['Information is', 'Feedback is', 'The advice was', 'nervous system', 'complex number', 'Simple interest', 'empty string', 'statistically significant']) assert(output.includes(phrase), `${style}: ${output}`);
  const protectedText = 'The record contains "lengthy", “employee”, `inspect`, and https://example.com/commence?count=42. Contact employee@example.com or read vendor-owned records. The folder belongs to Employee Smith and includes 42 files.';
  const protectedOutput = rewrite(protectedText, style);
  for (const phrase of ['"lengthy"', '“employee”', '`inspect`', 'https://example.com/commence?count=42', 'employee@example.com', 'vendor-owned', 'Employee Smith', '42']) assert(protectedOutput.includes(phrase), `${style}: ${protectedOutput}`);
  const articleOutput = rewrite('An employee chose an automobile and a sturdy box. An adorable dog waited near a roomy house.', style);
  assert(!/\b(?:an staff|an car|a automobile|an cute|a adorable|a evident|an succinct)\b/i.test(articleOutput), articleOutput);
  assert.equal(rewrite('The word commence refers to a verb.', style), 'The word commence refers to a verb.' + padding);
}
console.log('EN core: structural, tense, grammatical-context, article and protection checks passed.');
