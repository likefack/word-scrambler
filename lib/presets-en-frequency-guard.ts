// SPDX-License-Identifier: MIT
/**
 * Isolated, source-only port of frequent-adverb-context-v1/source_guard.py.
 * Offsets are original-input UTF-16 code-unit offsets, as used by JS strings.
 * No imports, I/O, corpus metadata, replacement text, or runtime NLP are used.
 * Apply only to new registrations, AFTER the existing r29 boundary/protection
 * gate; this local guard does not replace selection, grammar, or edit budgets.
 */
export type FrequentAdverbStyle = 'business' | 'academic' | 'casual';
export interface FrequentAdverbDecision { admit: boolean; reason: string }

const ALL_STYLES: readonly FrequentAdverbStyle[] = ['business', 'academic', 'casual'];
const STYLES: Readonly<Record<string, readonly FrequentAdverbStyle[]>> = {
  also: ['business', 'academic'],
  almost: ALL_STYLES,
  nearly: ALL_STYLES,
  again: ALL_STYLES,
  normally: ALL_STYLES,
  perhaps: ['casual'],
  similarly: ALL_STYLES,
};
const set = (s: string): ReadonlySet<string> => new Set(s.split(' '));
const SUBJECT = set('i you he she it we they');
const AUX = set('am is are was were be been being have has had do does did can could may might must shall should will would');
const MODAL = set('can could may might must shall should will would');
const COORD = set('and or but nor');
const FUNCTION = set('a an the this that these those my your his her its our their some any each every all both of to for from in on at with by as than and or but nor if while because which who whom whose what how where when');
const ENDPOINT = set('complete completed finished done ready full empty identical impossible perfect frozen exhausted destroyed extinct dead certain settled unanimous universal total entire whole');
const NUMWORDS = set('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion trillion half quarter twice');
const QUANTIFIERS = set('all every everyone everybody everything everywhere always both');
const OLD_ACTION = set('try tried trying check checked checking ask asked asking run ran play played playing begin began start started');
const NEG = /(?<![\p{L}\p{N}_])(?:not|cannot|never|no|none|nobody|nothing|neither|nor|without|hardly|scarcely|barely|nowhere|n+e+v+e+r+)(?![\p{L}\p{N}_])|n['’]t(?![\p{L}\p{N}_])/iu;
const UNICODE_WORD = /[\p{L}\p{N}_]/u;

const yes = (reason: string): FrequentAdverbDecision => ({ admit: true, reason });
const no = (reason: string): FrequentAdverbDecision => ({ admit: false, reason });
const inSet = (value: string, ...sets: ReadonlySet<string>[]): boolean => sets.some(s => s.has(value));
const words = (s: string): string[] =>
  Array.from(s.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)?|\p{Nd}+(?:[.,]\p{Nd}+)*/gu), m => m[0].toLowerCase().replace(/’/g, "'"));

function characterBefore(text: string, index: number): string {
  if (!index) return '';
  const last = text.charCodeAt(index - 1);
  if (index > 1 && last >= 0xdc00 && last <= 0xdfff) {
    const first = text.charCodeAt(index - 2);
    if (first >= 0xd800 && first <= 0xdbff) return text.slice(index - 2, index);
  }
  return text[index - 1];
}

function protectedReason(text: string, start: number, end: number): string | undefined {
  if ((start > 0 && /[-_/]/.test(text[start - 1])) || (end < text.length && /[-_/]/.test(text[end]))) {
    return 'compound_or_path';
  }
  // Intentional conservative difference: quote spans include newlines, matching
  // integrated r29's policy. An unmatched opening quote protects through EOF.
  // Apostrophes inside words neither open nor close a single-quote span.
  const patterns = [
    /"[^"]*(?:"|$)/g, /“[^”]*(?:”|$)/g, /`[^`]*(?:`|$)/g,
    /(?<![\p{L}\p{N}_])'(?:[^']|(?<=[\p{L}\p{N}_])'(?=[\p{L}\p{N}_]))*(?:'|$)/gu,
    /‘(?:[^’]|(?<=[\p{L}\p{N}_])’(?=[\p{L}\p{N}_]))*(?:’|$)/gu,
  ];
  for (const pattern of patterns) {
    for (const m of text.matchAll(pattern)) {
      const index = m.index!;
      if (index <= start && start < index + m[0].length) return 'quoted_or_code';
    }
  }
  return undefined;
}

function context(text: string, start: number, end: number) {
  // These are punctuation scopes, not a syntactic parse. Commas deliberately
  // retain earlier negation/correlatives across parenthetical material.
  const sl = text.slice(0, start).split(/[.!?;\n]/).pop()!;
  const sr = text.slice(end).split(/[.!?;\n]/)[0];
  const cl = sl.split(/[,:(]/).pop()!;
  const lw = words(sl), rw = words(sr), cw = words(cl);
  return {
    sl, sr, lw, rw, cw,
    initial: /^[ \t\r([{]*$/.test(sl),
    edge: /^[ \t\r([{]*$/.test(cl),
    prev: lw[lw.length - 1] || '', nxt: rw[0] || '',
  };
}

function verbalShape(word: string): boolean {
  return word.length > 3 && (word.endsWith('ed') || word.endsWith('ing') ||
    (word.endsWith('s') && !/(?:ss|ous|ics)$/.test(word)));
}

// This is deliberately a grammatical class, not a list of corpus expressions.
const FRACTION = /^(?:half|halves|quarter|quarters|thirds?|fourths?|fifths?|sixths?|sevenths?|eighths?|ninths?|tenths?|elevenths?|twelfths?|(?:thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twentie|thirtie|fortie|fiftie|sixtie|seventie|eightie|ninetie|hundred|thousand|million)ths?)$/;
const COMPARATIVE = set('bigger larger smaller wider narrower longer shorter taller higher lower deeper shallower heavier lighter faster slower older newer greater less more better worse further farther cheaper costlier dearer thicker thinner stronger weaker warmer cooler darker brighter');
function quantityWord(word: string): boolean {
  return NUMWORDS.has(word) || FRACTION.test(word) || /^\p{Nd}/u.test(word) || /^(?:percent|percentage|cent|cents|points?)$/.test(word);
}
function comparativeWord(word: string, following: readonly string[]): boolean {
  return COMPARATIVE.has(word) || (word.length > 3 && word.endsWith('er') && following.slice(0, 7).includes('than'));
}

/** All additive-quantity vetoes run together before EVERY again admission. */
function additiveAgain(sl: string, lw: readonly string[], rw: readonly string[]): boolean {
  const prev = lw[lw.length - 1] || '', next = rw[0] || '';
  // Preserve v1's conservative as ... again comparison protection.
  if (/(?<![\p{L}\p{N}_])as\s+[\p{L}\p{N}_]+(?:\s+[\p{L}\p{N}_]+){0,3}\s*$/iu.test(sl)) return true;

  // Fraction denominators must not enter the action-suffix or clausal fallback.
  // This intentionally also withholds e.g. "We checked the final third again."
  if (FRACTION.test(prev)) return true;
  // Raw symbols are absent from the original word tokenizer. Do not miss them.
  if (/(?:%|‰|‱|[¼-¾⅐-⅞])\s*$/u.test(sl)) return true;
  if (/\p{Nd}\s*[/⁄]\s*\p{Nd}+\s*$/u.test(sl)) return true;

  const rightDegree = comparativeWord(next, rw.slice(1)) ||
    (next === 'as' && rw[1] !== 'if' && rw[1] !== 'though' &&
      (rw.slice(2, 8).includes('as') || /^(?:much|many|long|wide|high|tall|large|big|far|fast|deep|heavy)$/.test(rw[1] || ''))) ||
    (next === 'the' && /^(?:size|width|height|length|depth|weight|volume|amount|number|cost|price)$/.test(rw[1] || ''));
  if (quantityWord(prev) && rightDegree) return true;

  // "bigger again than ..." and "ten percent larger again" have an additive
  // degree reading. Withholding also loses some genuine recurrent increases.
  if (comparativeWord(prev, rw)) {
    if (next === 'than' || lw.slice(-5, -1).some(quantityWord)) return true;
  }
  if (next === 'than' && /(?<![\p{L}\p{N}_])(?:more|less)\s+[\p{L}\p{N}_]+(?:\s+[\p{L}\p{N}_]+){0,2}\s*$/iu.test(sl)) return true;
  return false;
}

/** Optional diagnostic API. The boolean API below is the integration surface. */
export function frequentAdverbDecision(
  text: string, start: number, end: number, style: FrequentAdverbStyle,
): FrequentAdverbDecision {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length) {
    return no('invalid_utf16_span');
  }
  const word = text.slice(start, end).toLowerCase();
  const eligible = Object.prototype.hasOwnProperty.call(STYLES, word) ? STYLES[word] : undefined;
  if (!eligible) return no('not_a_proposed_source');
  const after = end < text.length ? String.fromCodePoint(text.codePointAt(end)!) : '';
  if (UNICODE_WORD.test(characterBefore(text, start)) || UNICODE_WORD.test(after)) return no('not_a_word_boundary');
  if (!eligible.includes(style)) return no('register_withheld');
  const protection = protectedReason(text, start, end);
  if (protection) return no(protection);
  const { sl, sr, lw, rw, cw, initial, edge, prev, nxt } = context(text, start, end);
  if (!nxt && word !== 'again') return no('elliptical_or_terminal');

  if (word === 'also') {
    if (/(?<![\p{L}\p{N}_])not\s+(?:only|just|merely)(?![\p{L}\p{N}_])/iu.test(sl) || prev === 'but') return no('correlative');
    if (COORD.has(prev) || ['see', 'cf', 'compare', 'refer', 'as', 'so'].includes(prev)) return no('coordination_or_cross_reference');
    if (initial && /^\s*,/.test(sr)) return yes('initial_additive_comma');
    if (edge && SUBJECT.has(nxt)) return yes('clause_edge_explicit_subject');
    if (inSet(prev, SUBJECT, AUX) || /^(?:i|you|he|she|it|we|they)'(?:m|re|s|ve|d|ll)$/.test(prev)) {
      if (!COORD.has(nxt) && !/^\s*[,;:!?]/.test(sr)) return yes('subject_or_auxiliary_midposition');
    }
    if (prev && !FUNCTION.has(prev) && verbalShape(nxt) && !/[,:(]\s*$/.test(sl)) return yes('midposition_inflected_predicate');
    return no('unresolved_additive_scope');
  }

  if (word === 'almost' || word === 'nearly') {
    if (NEG.test(sl)) return no('prior_negation_scope');
    if (['only', 'just', 'very', 'more', 'most', 'nowhere', 'so', 'too', 'how'].includes(prev)) return no('degree_modifier');
    if (['no', 'not', 'none', 'nothing', 'nobody', 'nowhere', 'never', 'any', 'anyone', 'anybody', 'anything', 'anywhere'].includes(nxt)) return no('negative_or_any_scope');
    if (QUANTIFIERS.has(nxt)) return yes('positive_totality');
    if (NUMWORDS.has(nxt) || /^\p{Nd}/u.test(nxt)) return yes('positive_quantity');
    if (['a', 'an'].includes(nxt) && rw.length > 1 && ['hundred', 'thousand', 'million', 'billion', 'trillion', 'half', 'quarter', 'third'].includes(rw[1])) return yes('fraction_or_large_quantity');
    if (ENDPOINT.has(nxt)) return yes('explicit_endpoint');
    // A later temporal/complement "as" does not make "as if/though" an
    // equative. This is scope classification, not a claim of ungrammaticality.
    if (nxt === 'as' && ['if', 'though'].includes(rw[1])) return no('non_equative_as_if_or_though');
    if (nxt === 'as' && rw.length >= 3 && rw.slice(2, 7).includes('as')) return yes('positive_equative');
    return no('unresolved_degree_or_stance');
  }

  if (word === 'again') {
    if (NEG.test(sl) || lw.includes('ever')) return no('negative_or_ever_scope');
    if (['once', 'then', 'time', 'times', 'born', 'same', 'much', 'many', 'half', 'come', 'over'].includes(prev)) return no('fixed_or_quantity_expression');
    if (/(?<![\p{L}\p{N}_])(?:now|time|over)\s+and\s*$/iu.test(sl)) return no('iteration_idiom');
    if (lw.includes('again') || rw.includes('again') || /^\s+and\s+(?:over|then)(?![\p{L}\p{N}_])/iu.test(sr)) return no('repeated_again_idiom');
    if (lw.some(w => ['keep', 'keeps', 'kept'].includes(w))) return no('persistent_iteration_scope');
    if (additiveAgain(sl, lw, rw)) return no('additive_quantity');
    if ((lw.length && ['what', 'who', 'where', 'when', 'which', 'how', 'why'].includes(lw[0])) || /(?<![\p{L}\p{N}_])remind\s+me(?![\p{L}\p{N}_])/iu.test(sl)) return no('reminder_question_or_unknown_wh_scope');
    if (initial && nxt) return yes('propositional_restatement');
    if (inSet(prev, SUBJECT, AUX) && nxt && !FUNCTION.has(nxt)) return yes('subject_or_auxiliary_repetition');
    if (OLD_ACTION.has(prev) || verbalShape(prev)) return yes('adjacent_action_shape');
    if (cw.length >= 2 && (SUBJECT.has(cw[0]) || cw.some(w => AUX.has(w)))) return yes('clausal_repetition_or_restored_state');
    return no('unresolved_repetition_scope');
  }

  if (word === 'normally') {
    if (initial && /^\s*,/.test(sr)) return yes('initial_habitual_comma');
    if (/^(?:distribut|proportion|develop|form)/.test(nxt) || ['functioning', 'breathing', 'behaving', 'running'].includes(nxt)) return no('manner_or_technical_reading');
    if (edge && SUBJECT.has(nxt)) return yes('clause_edge_habitual_subject');
    if (SUBJECT.has(prev) && !FUNCTION.has(nxt) && !nxt.endsWith('ing')) return yes('preverbal_habitual_pronoun');
    if (MODAL.has(prev) && ['be', 'have'].includes(nxt)) return yes('modal_usual_circumstances');
    if (prev && !inSet(prev, FUNCTION, AUX) && nxt.endsWith('s') && verbalShape(nxt)) return yes('preverbal_third_person_habit');
    return no('manner_frequency_ambiguity');
  }

  if (word === 'perhaps') {
    if (initial) return yes('initial_possibility');
    if (['and', 'but', 'or', 'that', 'because', 'so', 'then'].includes(prev) && SUBJECT.has(nxt)) return yes('embedded_clause_edge_explicit_subject');
    if (edge && SUBJECT.has(nxt)) return yes('punctuated_clause_edge_subject');
    return no('embedded_or_midposition_withheld');
  }

  if (word === 'similarly') {
    if ((initial || edge || ['and', 'but'].includes(prev)) && /^\s*,/.test(sr)) return yes('parallel_proposition_comma');
    return no('manner_or_complement_withheld');
  }
  return no('not_a_proposed_source');
}

export function allowsFrequentAdverb(
  text: string, start: number, end: number, style: FrequentAdverbStyle,
): boolean {
  return frequentAdverbDecision(text, start, end, style).admit;
}
