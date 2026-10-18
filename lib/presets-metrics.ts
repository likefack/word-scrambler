// SPDX-License-Identifier: MIT
import { changedWordCount, words, type AppliedEdit } from './rewriter';

/** Experimental measurement only: does not alter candidate eligibility/order.
 * The denominator and equality relation are exactly the existing words()/LCS.
 * Full-output suffix-LCS traceback: take an exact diagonal when possible;
 * otherwise skip an original token when both optimal continuations tie.
 * Repeated words can have multiple valid alignments, so these indices are one
 * deterministic attribution, not a uniquely proven location of a lexical edit.
 */
export function changedOriginalWordIndices(original: string, rewritten: string): number[] {
  const a = words(original), b = words(rewritten), width = b.length + 1;
  const rows = Array.from({ length: a.length + 1 }, () => new Uint16Array(width));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      rows[i][j] = a[i] === b[j] ? 1 + rows[i + 1][j + 1]
        : Math.max(rows[i + 1][j], rows[i][j + 1]);
    }
  }
  const changed: number[] = [];
  let i = 0, j = 0;
  while (i < a.length) {
    if (j < b.length && a[i] === b[j]) { i++; j++; }
    else if (j === b.length || rows[i + 1][j] >= rows[i][j + 1]) changed.push(i++);
    else j++;
  }
  if (changed.length !== changedWordCount(original, rewritten)) throw new Error('LCS attribution/count mismatch');
  return changed;
}

export function dictionaryWordBudget(totalWords: number): number {
  return Math.max(0, Math.floor(totalWords * .25));
}
const ratio = (changed: number, total: number) => total ? changed / total * 100 : 0;
export function measurePresetOutput(original: string, rewritten: string, edits: Pick<AppliedEdit, 'start' | 'end'>[]) {
  const totalWords = words(original).length;
  const sourceWords = [...new Intl.Segmenter('ja', { granularity: 'word' }).segment(original)].filter(part => part.isWordLike);
  const changedIndices = changedOriginalWordIndices(original, rewritten);
  const totalWordsByThird = [0, 0, 0], changedWordsByThird = [0, 0, 0], editMidpointsByThird = [0, 0, 0];
  const tokenThird = (index: number) => index < Math.floor(totalWords / 3) ? 0 : index < Math.floor(2 * totalWords / 3) ? 1 : 2;
  for (let index = 0; index < totalWords; index++) totalWordsByThird[tokenThird(index)]++;
  for (const index of changedIndices) changedWordsByThird[tokenThird(index)]++;
  // The edit midpoint is the center of its original ICU word-index span, using
  // the same word thirds as above. A phrase crossing thirds receives one zone.
  // Candidate density, output length and UTF-16 character thirds are not used.
  for (const edit of edits) {
    if (!Number.isInteger(edit.start) || !Number.isInteger(edit.end) || edit.start < 0 || edit.end <= edit.start || edit.end > original.length) throw new Error('Invalid source span');
    const covered = sourceWords.map((part, index) => ({part, index})).filter(({part}) => part.index < edit.end && part.index + part.segment.length > edit.start);
    if (!covered.length) throw new Error('Edit span contains no original words');
    editMidpointsByThird[tokenThird((covered[0].index + covered[covered.length - 1].index) / 2)]++;
  }
  const changedWords = changedIndices.length, budgetWords = dictionaryWordBudget(totalWords);
  return {
    totalWords, changedWords, ratio: ratio(changedWords, totalWords), budgetWords,
    withinBudget: changedWords <= budgetWords, changedOriginalWordIndices: changedIndices,
    originalTokenThirds: {
      totalWords: totalWordsByThird, changedWords: changedWordsByThird,
      ratios: changedWordsByThird.map((count, zone) => ratio(count, totalWordsByThird[zone])),
      changedZoneCount: changedWordsByThird.filter(Boolean).length,
    },
    originalWordMidpointThirds: {
      edits: editMidpointsByThird, changedZoneCount: editMidpointsByThird.filter(Boolean).length,
    },
  };
}
