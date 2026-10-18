import{allowsBroadMatch}from'./presets-broad-guards';
import{BROAD_SCOPES}from'./presets-broad-scopes';
import{JA_BROAD}from'./presets-ja-broad';
import{EN_BROAD}from'./presets-en-broad';
import { JA_EXPANDED } from './presets-ja-expanded';
import { EN_EXPANDED } from './presets-en-expanded';
import { JA_CORE } from './presets-ja-core';
import { EN_CORE } from './presets-en-core';
import { applyModelOutput, changedWordCount, detectLanguage, validateInput, type Edit, type InputLanguage, type RewriteResult } from './rewriter';

export type StyleId = 'business' | 'academic' | 'casual';
export type StyleSelection = StyleId | 'auto';
type Language = 'ja' | 'en';
type Pair = readonly [string, string];
export type StyleClassification = {
  id: StyleId;
  label: string;
  /** Rule-match strength, 0–1. This is not a calibrated probability. */
  confidence: number;
  evidence: string[];
  scores: Record<StyleId, number>;
};
export const STYLE_OPTIONS: { id: StyleId; label: string; description: string }[] = [
  { id: 'business', label: '丁寧・ビジネス', description: '依頼や案内に合う、丁寧な語句' },
  { id: 'academic', label: '説明・論文調', description: '説明や考察に合う、落ち着いた語句' },
  { id: 'casual', label: 'カジュアル', description: '会話や日記に合う、親しみやすい語句' },
];

/** Independent, reviewed phrase dictionaries. These are alternatives, not style conversions.
 * Full Japanese inflections and English phrases avoid unsafe stem/part-of-word changes.
 * Matching is against the original text only: a replacement is never rewritten again.
 */
const BASE_DICTIONARIES: Record<Language, Record<StyleId, readonly Pair[]>> = {
  ja: {
    business: [
      ['お忙しいところ', 'ご多忙のところ'],
      ['お送りいたします', '送付いたします'],
      ['資料をまとめました', '資料を整理しました'],
      ['今回の提案では', '本提案では'],
      ['負担を減らし', '負担を軽減し'],
      ['より快適に', 'さらに快適に'],
      ['内容をご確認いただき', '内容をお確かめいただき'],
      ['ご意見をいただけますと幸いです', 'ご意見をお寄せいただけますと幸いです'],
      ['ご返信をお待ちしております', 'お返事をお待ちしております'],
      ['ご対応いただきありがとうございます', 'ご対応くださりありがとうございます'],
      ['できるだけ早く', '可能な限り早く'],
      ['詳しい内容について', '詳細について'],
      ['詳細について', '詳しい内容について'],
      ['この件について', '本件について'],
      ['ご不明な点', 'ご不明点'],
      ['以下のとおり', '次のとおり'],
      ['事前に確認', 'あらかじめ確認'],
      ['あらかじめ確認', '事前に確認'],
      ['追加の資料', '補足資料'],
      ['ご協力いただきありがとうございます', 'ご協力くださりありがとうございます'],
      ['ご参加いただきありがとうございます', 'ご参加くださりありがとうございます'],
      ['ご検討いただきありがとうございます', 'ご検討くださりありがとうございます'],
      ['ご確認いただけますと幸いです', 'お確かめいただけますと幸いです'],
      ['ご都合のよい日時', 'ご都合のよろしい日時'],
      ['お手数をおかけしますが', 'お手数をおかけいたしますが'],
      ['必要な情報', '必要とされる情報'],
      ['改めて確認', '再度確認'],
      ['そのため、', 'このため、'],
    ],
    academic: [
      ['本研究において', '本研究では'],
      ['この結果から', 'この結果より'],
      ['明らかになった', '判明した'],
      ['明らかになりました', '判明しました'],
      ['重要である', '肝要である'],
      ['ことが大切です', 'ことが重要です'],
      ['ことが大切である', 'ことが重要である'],
      ['欠かせません', '不可欠です'],
      ['欠かせない。', '不可欠である。'],
      ['必要な水の量', '必要とされる水の量'],
      ['確認してから', '確かめてから'],
      ['異なります', '相違します'],
      ['異なること', '相違すること'],
      ['様々な要因', '多様な要因'],
      ['さまざまな要因', '多様な要因'],
      ['様々な方法', '多様な方法'],
      ['さまざまな方法', '多様な方法'],
      ['たとえば、', '例として、'],
      ['さらに、', '加えて、'],
      ['これにより、', 'これによって、'],
      ['その結果、', 'その結果として、'],
      ['そのため、', 'このため、'],
      ['について検討する', 'に関して検討する'],
      ['について分析する', 'に関して分析する'],
      ['を用いて', 'を使用して'],
      ['に基づいて、', 'に基づき、'],
      ['このように、', '以上のように、'],
    ],
    casual: [
      ['少し早起きして', 'ちょっと早起きして'],
      ['少しだけ', 'ちょっとだけ'],
      ['少し早く', 'ちょっと早く'],
      ['少し遅く', 'ちょっと遅く'],
      ['近所の公園', '近くの公園'],
      ['ひんやりしていて、', '少し冷たくて、'],
      ['頭がすっきりしてきた', '頭がさえてきた'],
      ['帰り道に', '帰る途中に'],
      ['小さなパン屋', '小さいパン屋'],
      ['小さな店', '小さい店'],
      ['穏やかな朝', '落ち着いた朝'],
      ['いいなと思った', 'いいなと感じた'],
      ['とても楽しかった', 'すごく楽しかった'],
      ['とても楽しい', 'すごく楽しい'],
      ['とてもおいしかった', 'すごくおいしかった'],
      ['とてもおいしい', 'すごくおいしい'],
      ['とても嬉しかった', 'すごく嬉しかった'],
      ['とてもきれいだった', 'すごくきれいだった'],
      ['たくさん話した', 'いっぱい話した'],
      ['たくさん食べた', 'いっぱい食べた'],
      ['たくさん歩いた', 'いっぱい歩いた'],
      ['ときどき思う', 'たまに思う'],
                  ['お腹がすいた', 'お腹がへった'],
      ['おなかがすいた', 'おなかがへった'],
      ['ちょっと休もう', '少し休もう'],
    ],
  },
  en: {
    business: [
      ['please review', 'kindly review'],
      ['please confirm', 'kindly confirm'],
      ['please let me know', 'please inform me'],
      ['let me know if you have any questions', 'tell me if you have any questions'],
      ['would appreciate your feedback', 'would welcome your feedback'],
      ['additional information', 'further information'],
      ['further details', 'additional details'],
      ['in addition,', 'additionally,'],
      ['at this time,', 'currently,'],
      ['at present,', 'currently,'],
      ['as soon as possible', 'as promptly as possible'],
      ['for this reason,', 'therefore,'],
      ['with regard to', 'regarding'],
      ['regarding your request', 'concerning your request'],
      ['take into account', 'consider'],
      ['takes into account', 'considers'],
      ['provide an update', 'share an update'],
      ['complete the task', 'finish the task'],
      ['complete the project', 'finish the project'],
      ['start the meeting', 'begin the meeting'],
      // Bare before/after + noun fragments can introduce finite clauses;
      // do not convert their conjunction into a preposition without a parser.
      ['respond to your email', 'reply to your email'],
      ['thank you for your help', 'thank you for your assistance'],
      ['can help with', 'can assist with'],
      ['will help with', 'will assist with'],
      ['making the service more convenient', 'making the service easier to use'],
      ['when you have a moment', 'when you have some time'],
      ['reducing the effort required', 'decreasing the effort required'],
    ],
    academic: [
      ['for example', 'for instance'],
      ['in contrast', 'by contrast'],
      ['as a result,', 'consequently,'],
      ['in addition,', 'furthermore,'],
      ['therefore', 'thus'],
      ['with respect to', 'with regard to'],
      ['in order to', 'to'],
      ['due to the fact that', 'because'],
      ['despite the fact that', 'although'],
      ['prior to', 'before'],
      ['subsequent to', 'after'],
      ['a large number of', 'many'],
      ['a small number of', 'a few'],
      ['the majority of the', 'most of the'],
      ['takes into account', 'considers'],
      ['take into account', 'consider'],
      ['took into account', 'considered'],
      ['taking into account', 'considering'],
      ['demonstrates that', 'shows that'],
      ['demonstrate that', 'show that'],
      ['this study examines', 'this study investigates'],
      ['a key role', 'a central role'],
      ['vary depending on', 'vary according to'],
      ['depends on', 'is dependent on'],
      ['to determine whether', 'to establish whether'],
      ['not the same as', 'different from'],
      ['over a period of', 'over the course of'],
      ['plants need', 'plants require'],
      ['they require', 'they need'],
      ['it is important to check', 'it is important to verify'],
    ],
    casual: [
      ['a little earlier', 'a bit earlier'],
      ['a little later', 'a bit later'],
      ['a little more', 'a bit more'],
      ['a little less', 'a bit less'],
      ['a little tired', 'a bit tired'],
      ['went for a walk', 'took a walk'],
      ['on my way home', 'on the way home'],
      ['really enjoy', 'really like'],
      ['really enjoyed', 'really liked'],
      ['really happy', 'very happy'],
      ['really tired', 'very tired'],
      ['was really fun', 'was a lot of fun'],
      ['is really fun', 'is a lot of fun'],
      ['had a great time', 'had a really good time'],
      ['a lot of', 'lots of'],
      ['right now', 'at the moment'],
      ["I'm busy at the moment", "I'm busy right now"],
      ['every now and then', 'once in a while'],
      ['once in a while', 'now and then'],
      ['I do as well.', 'I do too.'],
      ['can you give me a hand', 'can you help me out'],
      ["that's no problem", "that's no trouble"],
      ["let's get started", "let's start"],
      ["let's head home", "let's go home"],
      ['see you later', 'catch you later'],
      ['want to grab lunch', 'want to get lunch'],
      ['sort of', 'kind of'],
      ['kind of', 'sort of'],
      ['to be honest,', 'honestly,'],
    ],
  },
};

// Source-key de-duplication keeps one deterministic alternative per style.
function combine(...inventories: (readonly Pair[])[]): readonly Pair[] {
  const seen=new Set<string>();
  return inventories.flat().filter(([source])=>{if(seen.has(source))return false;seen.add(source);return true;});
}
export const STYLE_DICTIONARIES: Record<Language, Record<StyleId, readonly Pair[]>> = {
  ja: {business:combine(BASE_DICTIONARIES.ja.business,JA_EXPANDED.business,JA_CORE.business,JA_BROAD.business),academic:combine(BASE_DICTIONARIES.ja.academic,JA_EXPANDED.academic,JA_CORE.academic,JA_BROAD.academic),casual:combine(BASE_DICTIONARIES.ja.casual,JA_EXPANDED.casual,JA_CORE.casual,JA_BROAD.casual)},
  en: {business:combine(BASE_DICTIONARIES.en.business,EN_EXPANDED.business,EN_CORE.business,EN_BROAD.business),academic:combine(BASE_DICTIONARIES.en.academic,EN_EXPANDED.academic,EN_CORE.academic,EN_BROAD.academic),casual:combine(BASE_DICTIONARIES.en.casual,EN_EXPANDED.casual,EN_CORE.casual,EN_BROAD.casual)},
};

type Signal = { pattern: RegExp; weight: number; description: string };
const SIGNALS: Record<Language, Record<StyleId, Signal[]>> = {
  ja: {
    business: [
      { pattern: /お世話になって|お願いいたします|お願い申し上げ|幸いです/g, weight: 4, description: '挨拶・丁寧な依頼' },
      { pattern: /ご確認|ご連絡|ご検討|ご意見|お送り|ご多忙|お忙しい/g, weight: 3, description: '敬語・依頼表現' },
      { pattern: /いたします|いただき|いただけ|おります/g, weight: 2, description: '謙譲・丁寧な語尾' },
      { pattern: /企画|資料|提案|会議|送付|業務|担当|納期|期限|取引|顧客|契約|請求|承認|日程|見積|お客様|ご担当/g, weight: 1, description: '仕事に関する語彙' },
      { pattern: /です[。！？]|ます[。！？]/g, weight: 1, description: 'です・ます調' },
    ],
    academic: [
      { pattern: /研究|分析|考察|実験|検証|仮説|理論|統計|相関|比較|評価|測定|推定|観測|調査|条件/g, weight: 3, description: '研究・考察の語彙' },
      { pattern: /である|と考えられる|に基づ|示唆|観察/g, weight: 3, description: '説明・論文調の表現' },
      { pattern: /したがって|その結果|ただし|必要|重要|異なり|によって/g, weight: 2, description: '条件・根拠を説明する表現' },
      { pattern: /性質|構造|機能|種類|状態|過程|原理|定義|現象|要因|傾向|特性|特徴/g, weight: 1, description: '説明文で使う語彙' },
    ],
    casual: [
      { pattern: /だよ|だね|じゃん|なんか|ちょっと|すごく|やっぱり|いいな|めっちゃ|ほんと|たぶん|かな[。！？]|しちゃ|かも[。！？]/g, weight: 3, description: '会話的な表現' },
      { pattern: /だった[。！？]|した[。！？]|思った|買って帰った/g, weight: 2, description: '日記・会話の常体' },
      { pattern: /今日|昨日|週末|休み|友達|家族|散歩|買い物|帰り道|おいしい|楽しい|うれしい|疲れ|遊び|ごはん/g, weight: 1, description: '日常の出来事の語彙' },
    ],
  },
  en: {
    business: [
      { pattern: /\b(?:please|kindly|regards)\b/gi, weight: 3, description: '丁寧な依頼・挨拶' },
      { pattern: /\b(?:thank you|would appreciate|continued support)\b/gi, weight: 3, description: '感謝・配慮の表現' },
      { pattern: /\b(?:proposal|feedback|meeting|document|materials|project|deadline|schedule|invoice|client|customer|approval|delivery|attached|appointment|team|request|agreement|contract)\b/gi, weight: 2, description: '仕事に関する語彙' },
    ],
    academic: [
      { pattern: /\b(?:research|study|hypothesis|evidence|analysis|findings|experiment|theory|statistical|correlation|methodology|measurement|observations|variables|distribution|dataset)\b/gi, weight: 3, description: '研究・考察の語彙' },
      { pattern: /\b(?:therefore|however|consequently|in contrast|for example|depends on)\b/gi, weight: 2, description: '論理・条件を表す接続' },
      { pattern: /\b(?:require|important|observe|according|rather than|process|structure|function|properties|conditions|phenomenon|factors|indicate|demonstrate)\b/gi, weight: 1, description: '説明文で使う語彙' },
    ],
    casual: [
      { pattern: /\b(?:don't|can't|it's|that's|let's|I'm|you're|I've|didn't)\b/gi, weight: 2, description: '会話的な短縮形' },
      { pattern: /\b(?:really|a little|a lot of|kind of|sort of|see you|no worries)\b/gi, weight: 2, description: 'くだけた表現' },
      { pattern: /\b(?:today|yesterday|weekend|home|walk|morning|happy|fun|tired|friends|family|lunch|dinner|movie|relax|hang out)\b/gi, weight: 1, description: '日常の出来事の語彙' },
      { pattern: /\b(?:I|my)\b/g, weight: 1, description: '一人称の語り' },
    ],
  },
};

type Span = { start: number; end: number };
function protectedSpans(text: string): Span[] {
  const patterns = [
    /https?:\/\/[^\s「」『』<>]+/g,
    /www\.[^\s「」『』<>]+/g,
    /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,
    /[0-9０-９]+(?:[.,，．:/\-][0-9０-９]+)*/g,
    /`[^`]*`|"[^"]*"|“[^”]*”|「[^」]*」|『[^』]*』|‘[^’]*’/g,
    /(?:^|[\s(])'[^'\n]+'(?=$|[\s),.!?])/g,
    /(?:株式会社|有限会社)[^\s、。！？\n]{1,40}/g,
    /[^\s、。！？\n]{1,40}(?:株式会社|有限会社)/g,
  ];
  const spans: Span[] = [];
  // Unquoted names and words under discussion are still data, not replacement targets.
  // A rule-based engine cannot reliably locate the exact named span, so preserve the
  // entire sentence/clause containing an explicit naming or metalinguistic cue.
  for (const match of text.matchAll(/[^。！？.!?\n]+[。！？.!?]?/g)) {
    if (/(?:という|といった|と呼ばれる)(?:名前|名称|店名|社名|人名|語|言葉|表現|文字列)|(?:名前|名称|店名|社名|人名)|\b(?:the (?:word|phrase|term|name)|named|entitled|(?:is|was|are|were|be|been|being)\s+called)\b/i.test(match[0])) {
      spans.push({start:match.index!,end:match.index!+match[0].length});
    }
  }
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) spans.push({ start: match.index!, end: match.index! + match[0].length });
  }
  return spans;
}
function overlaps(span: Span, spans: Span[]) { return spans.some(other => span.start < other.end && span.end > other.start); }
function maskProtected(text: string): string {
  let safe = text;
  for (const span of protectedSpans(text).sort((a, b) => b.start - a.start)) safe = safe.slice(0, span.start) + ' '.repeat(span.end - span.start) + safe.slice(span.end);
  return safe;
}
export function classifyStyle(text: string, language: InputLanguage = 'auto'): StyleClassification {
  const actualLanguage = language === 'auto' ? detectLanguage(text) : language;
  const scores: Record<StyleId, number> = { business: 0, academic: 0, casual: 0 };
  const found: Record<StyleId, string[]> = { business: [], academic: [], casual: [] };
  const safe = maskProtected(text);
  for (const { id } of STYLE_OPTIONS) {
    for (const signal of SIGNALS[actualLanguage][id]) {
      const matches = [...safe.matchAll(signal.pattern)];
      if (!matches.length) continue;
      scores[id] += Math.min(matches.length, 3) * signal.weight;
      found[id].push(`${signal.description}「${matches[0][0]}」`);
    }
  }
  const sorted = [...STYLE_OPTIONS].sort((a, b) => scores[b.id] - scores[a.id]);
  // No evidence is explicitly low-confidence; a default never pretends to understand meaning.
  const id = scores[sorted[0].id] ? sorted[0].id : 'casual';
  const top = scores[id], second = scores[sorted.find(style => style.id !== id)!.id];
  const confidence = top ? Math.round(Math.min(.94, .38 + Math.min(.28, top * .025) + Math.min(.28, (top - second) * .035)) * 100) / 100 : .25;
  return {
    id, label: STYLE_OPTIONS.find(style => style.id === id)!.label, confidence, scores,
    evidence: found[id].length ? found[id].slice(0, 3) : ['特徴語が少ないため、仮の分類です'],
  };
}
function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function occurrenceAt(text: string, original: string, position: number): number {
  let occurrence = 0, from = 0;
  while (from <= position) {
    const index = text.indexOf(original, from);
    if (index < 0 || index === position) return occurrence;
    occurrence++; from = index + original.length;
  }
  return occurrence;
}
function matchCase(original: string, replacement: string): string | null {
  if (original === original.toUpperCase()) return replacement.toUpperCase();
  if (original === original.toLowerCase()) return replacement;
  const sentenceCase = original[0].toUpperCase() + original.slice(1).toLowerCase();
  if (original === sentenceCase) return replacement[0].toUpperCase() + replacement.slice(1);
  // Pronoun I is ordinary text, not title case. Other mixed/title case may be a name.
  if (original.startsWith('I ') && original.slice(2) === original.slice(2).toLowerCase()) return replacement;
  return null;
}
function sentenceStart(text: string, index: number): boolean { return !text.slice(0, index).trim() || /[.!?。！？\n]\s*$/.test(text.slice(0, index)); }

// "hard" is both an adjective (is hard to read) and an effort adverb
// (works hard to read). A bare phrase match cannot distinguish these senses.
// Only a nearby, explicit copular frame licenses hard -> difficult here.
// Unrecognized constructions stay unchanged rather than guessing their POS.
function hasAdjectivalHardFrame(text: string, start: number): boolean {
  return /(?:^|[^\p{L}\p{M}\p{N}_'’])(?:am|is|are|was|were|be|been|being|isn['’]t|aren['’]t|wasn['’]t|weren['’]t|(?:it|that|there|he|she)['’]s|(?:we|you|they)['’]re|i['’]m)[ \t]+(?:(?:not|very|too|so|quite|rather|especially|particularly|extremely|really|more|less|most|least|somewhat|unusually|still|just)[ \t]+){0,3}$/iu.test(text.slice(0, start));
}

export function presetRewrite(text: string, language: InputLanguage = 'auto', style: StyleSelection = 'auto'): RewriteResult {
  validateInput(text);
  const actualLanguage = language === 'auto' ? detectLanguage(text) : language;
  const classification = classifyStyle(text, language);
  const selected = style === 'auto' ? classification.id : style;
  const definition = STYLE_OPTIONS.find(item => item.id === selected);
  if (!definition) throw new Error('指定された文体が見つかりません。');
  const immutable = protectedSpans(text);
  const segmenter = new Intl.Segmenter(actualLanguage, { granularity: 'word' });
  const boundaries = new Set<number>([0, text.length]);
  for (const segment of segmenter.segment(text)) { boundaries.add(segment.index); boundaries.add(segment.index + segment.segment.length); }
  const candidates: (Edit & Span & { count: number })[] = [];
  for (const [source, target] of STYLE_DICTIONARIES[actualLanguage][selected]) {
    const pattern = new RegExp(escapeRegex(source), actualLanguage === 'en' ? 'gi' : 'g');
    for (const match of text.matchAll(pattern)) {
      const start = match.index!, original = match[0], end = start + original.length;
      if (!boundaries.has(start) || !boundaries.has(end) || overlaps({ start, end }, immutable)) continue;
      const broadScope = BROAD_SCOPES[[actualLanguage,selected,source,target].join('\0')];
      if (broadScope && !allowsBroadMatch(text,start,end,broadScope,selected,target)) continue;
      // Partial lexical substitutions must not strand honorific お/ご prefixes.
      if (actualLanguage === 'ja' && /^[\p{Script=Han}]/u.test(original) && /[おご]/.test(text[start-1]??'')) continue;
      // The connective 加えて is safe here only at a sentence boundary. In
      // noun + に加えて it is part of a compound postposition, not an adverb.
      if (actualLanguage === 'ja' && source === '加えて、' && !sentenceStart(text, start)) continue;
      if (actualLanguage === 'en' && /[-_'’]/.test((text[start - 1] ?? '') + (text[end] ?? ''))) continue;
      if (actualLanguage === 'en' && /^hard to\b/i.test(source) && /^difficult to\b/i.test(target) && !hasAdjectivalHardFrame(text, start)) continue;
      // A compound-capable kanji noun cannot safely become a verbal/noun phrase
      // inside another kanji compound (e.g. 作業 + 手順 -> 作業 + 進め方).
      // した may be past する or the start of a desire form (したがる,
      // したさ, したそう, etc.). Do not attach those tails to a nonsuru past.
      // Past + contrastive が/けれど and causal から remain eligible.
      if (actualLanguage === 'ja' && original.endsWith('した') && !target.endsWith('した')) {
        const after = text.slice(end);
        if (/^(?:い|く|かっ)/.test(after)) continue;
        const desireTail = /^(?:かろう|ければ|けりゃ|が(?:る|ら|り|れ|ろう|っ)|さ|そう|げ)/.exec(after)?.[0];
        // Do not confuse a prefix wholly inside a following noun (e.g. がれき)
        // with an auxiliary. A boundary within the tail also counts: Segmenter
        // may split が|ろうと rather than がろう|と.
        if (desireTail && [...desireTail].some((_, index) => boundaries.has(end + index + 1))) continue;
      }
      if (actualLanguage === 'ja' && /^[\p{Script=Han}]/u.test(original) && /[\p{Script=Han}]/u.test(text[start-1]??'') && /[\p{Script=Hiragana}]/u.test(target) && original.match(/^[\p{Script=Han}]+/u)?.[0]!==target.match(/^[\p{Script=Han}]+/u)?.[0]) continue;
      if (actualLanguage === 'ja' && /^[\p{Script=Han}]+$/u.test(original) && /[\p{Script=Hiragana}]/u.test(target) && /[\p{Script=Han}]/u.test((text[start-1]??'')+(text[end]??''))) continue;
      // A capitalized English phrase in the middle of a sentence may be a title/name.
      if (actualLanguage === 'en' && /^[A-Z]/.test(original) && !original.startsWith('I ') && original !== original.toUpperCase() && !sentenceStart(text, start)) continue;
      const replacement = actualLanguage === 'en' ? matchCase(original, target) : target;
      if (!replacement || original === replacement) continue;
      if (actualLanguage==='en' && source==='a lot of' && /\b(?:quite|such|rather)\s+$/i.test(text.slice(0,start))) continue;
      // Do not turn "a concise ..." into "a abbreviated ..." (or the reverse).
      // Leave the article and the candidate untouched when their initial sound classes differ.
      if (actualLanguage === 'en' && /\b(?:a|an)\s+$/i.test(text.slice(0, start))) {
        const vowelSound = (value: string) => /^(?:honest|honou?r|hour|heir)/i.test(value) || (/^[aeiou]/i.test(value) && !/^(?:uni(?:t|que|vers)|use|user|usual|euro|one\b)/i.test(value));
        if (vowelSound(original) !== vowelSound(replacement)) continue;
      }
      const count = changedWordCount(original, replacement);
      if (count) candidates.push({ original, replacement, occurrence: occurrenceAt(text, original, start), start, end, count });
    }
  }
  // Favor short, local edits and spread them over the document deterministically.
  // The shared validator caps source-word changes and discards overlapping candidates.
  const buckets = [0, 1, 2, 3].map(bucket => candidates.filter(item => Math.min(3, Math.floor(item.start / text.length * 4)) === bucket).sort((a, b) => a.count - b.count || a.start - b.start || b.end - a.end));
  const edits: Edit[] = [];
  for (let i = 0; i < Math.max(...buckets.map(bucket => bucket.length)); i++) for (const bucket of buckets) if (bucket[i]) edits.push(bucket[i]);
  const automatic = style === 'auto';
  const confidenceLabel = classification.confidence >= .75 ? '高め' : classification.confidence >= .5 ? '中程度' : '低め';
  const explanation = automatic
    ? `特徴語と語尾のルールから「${definition.label}」と推定しました。分類の手がかりは${confidenceLabel}です（ルールに基づく指標であり、分類精度の実測値ではありません）。${classification.evidence.join('、')}。選んだ文体の辞書だけを使い、別の文体には変換しません。`
    : `手動で選んだ「${definition.label}」の辞書を使いました。原文の自動推定は「${classification.label}」（分類の手がかり：${confidenceLabel}）。指定は辞書の切り替えであり、文体全体の変換ではありません。`;
  const result = applyModelOutput(text, {
    style: { label: definition.label, features: [automatic ? 'ルールで自動推定' : '手動で辞書を指定', ...classification.evidence.slice(0, 2), `分類の手がかり：${confidenceLabel}`], explanation },
    edits, protected_terms: [], note: '',
  }, { maxEdits: 512 });
  // Replace AI-oriented generic notes with precise, honest descriptions of this local mode.
  result.notes = [];
  if (!result.edits.length) result.notes.push('この文体の辞書に、安全条件を満たす候補がなかったため、原文をそのまま残しました。');
  else if (result.ratio < 20 || result.ratio > 30) result.notes.push('辞書の候補と変更量の上限を優先したため、置き換え率は25%から離れています。');
  result.notes.push('辞書・ルール方式です。AIの意味理解は行いません。数字・URL・引用部分を避けますが、固有名詞や文脈を完全には識別できないため、結果を確認してください。');
  if (automatic && classification.confidence < .5) result.notes.push('文体の手がかりが少ないか、複数の文体が混ざっています。合わない場合は辞書を手動で選んでください。');
  return result;
}
