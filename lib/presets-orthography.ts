// SPDX-License-Identifier: MIT
/** Only audited spelling variants are removed. This is not a synonym or POS test.
 * Keep registrations unchanged: filtering occurs before candidate selection.
 * Never erase punctuation, spaces or particles: "re-sign"/"resign", "let's"/
 * "lets", "a part"/"apart", and "は"/"が" are not spelling equivalences.
 */
const EXACT_ORTHOGRAPHIC_PAIRS: readonly (readonly [string, string])[] = [
  ["先日の打ち合わせ", "先日の打合せ"],
  ["打ち合わせの日程", "打合せの日程"],
  ["打ち合わせの内容", "打合せの内容"],
  ["後ほど", "のちほど"],
  ["朝ごはん", "朝ご飯"],
  ["昼ごはん", "昼ご飯"],
  ["晩ごはん", "晩ご飯"],
  ["夜ごはん", "夜ご飯"],
  ["夕ごはん", "夕ご飯"],
  ["部屋を片づけた", "部屋を片付けた"],
  ["机を片づけた", "机を片付けた"],
  ["荷物を片づけた", "荷物を片付けた"],
  ["片付けが終わった", "片づけが終わった"],
  ["お腹いっぱい", "おなかいっぱい"],
  ["喉が渇いた", "のどが渇いた"],
  ["温かいお茶", "あたたかいお茶"],
  ["何となく", "なんとなく"],
];

function surfaceKey(text: string): string {
  return text.normalize('NFC')
    // Fullwidth ASCII has a direct, reversible spelling correspondence.
    .replace(/[！-～]/gu, char => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/gu, ' ')
    .replace(/[A-Z]/g, char => char.toLowerCase())
    .replace(/[ァ-ヶ]/gu, char => String.fromCharCode(char.charCodeAt(0) - 0x60));
}
export function isOrthographicOnlyPair(original: string, replacement: string): boolean {
  const a = surfaceKey(original), b = surfaceKey(replacement);
  return a === b || EXACT_ORTHOGRAPHIC_PAIRS.some(([left, right]) =>
    (a === surfaceKey(left) && b === surfaceKey(right)) ||
    (b === surfaceKey(left) && a === surfaceKey(right)));
}
