// SPDX-License-Identifier: MIT
/** Additive source-only admission for the isolated Japanese frequent-context batch.
 * Run only for NEW style/source registrations, after unchanged r29 protections and
 * exact-source priority. This is bounded admission, not a parser or equivalence proof.
 * All positions are JavaScript UTF-16 offsets into the unmodified original input.
 */
import { JAPANESE_FREQUENT_CONTEXT_RULES, JAPANESE_FREQUENT_CONTEXT_EXCLUDED, type JapaneseFrequentStyle, type JapaneseFrequentRule } from './presets-broad-scopes';
export type JapaneseFrequentContextReason = 'invalid_span' | 'unsupported_style' | 'unknown_source' | 'withheld_ambiguous_frequency' | 'deferred_low_yield' | 'source_word_boundary' | 'protected_source' | 'literal_text_context' | 'exact_copy_context' | 'unadmitted_left_context' | 'unadmitted_right_context' | 'negative_or_scope_continuation' | 'impossibility_scope_continuation' | 'invalid_affirmative_phrase' | 'existing_source_priority';
export type JapaneseFrequentContextDiagnostic = {
 readonly allowed: boolean; readonly reason: JapaneseFrequentContextReason | null;
 readonly start: number; readonly end: number; readonly source: string; readonly style: string;
 readonly ruleId?: string; readonly family?: string; readonly head?: string; readonly target?: string;
 readonly existingTarget?: string;
};
type Span = {start:number;end:number;reason:'protected_source'|'literal_text_context'};
type Context = {text:string;boundaries:Set<number>;spans:Span[];exactCopy:boolean};
const rulesBySource=new Map<string,JapaneseFrequentRule>(JAPANESE_FREQUENT_CONTEXT_RULES.map(rule=>[rule.source,rule]));
const excludedBySource=new Map<string,typeof JAPANESE_FREQUENT_CONTEXT_EXCLUDED[number]>(JAPANESE_FREQUENT_CONTEXT_EXCLUDED.map(rule=>[rule.source,rule]));
const segmenter=new Intl.Segmenter('ja',{granularity:'word'});
const sentenceStop=/[。！？!?]/u;
// Preserve the prototype's conservative sentence-wide check. In particular, ないし,
// certainty idioms and unrelated later negatives can abstain; that is a known cost.
const negativeOrScope=/(?:ない|なかっ|なく|なけれ|ません|ぬ(?:[。！？!?、，,]|$)|無理|不可能|言え|いえ|言い難|言いがた|とは限|わけで|訳で|はずが|どころ|どんなに|いくら|思え(?:ず|ぬ|ん)|思わ(?:ず|ぬ|ん)|あり得|ありえ)/u;
// Repair the independently demonstrated cannot-possibly readings of とても.
// Regex recognition is a conservative scope warning, never proof of meaning damage.
const impossibilityScope=/(?:まい|ようか)/u;
const literalCue=/(?:言い換え|書き換え|書換|置き換え|置換|差し替え|答案|解答|正答|正解|一言|発言|語句|単語|文字|文言|文章|例文|本文|文中|文では|文には|動詞|名詞|形容詞|副詞|助詞|助動詞|述語|主語|言葉|表記|名称|名前|店名|社名|人名|商品名|作品名|ラベル|見出し|題名|タイトル|項目|メニュー|ボタン|欄|掲示|看板|画面|入力|タイプ|訂正|修正|校正|記載|印字|印刷|表示|発音|書(?:く|い|き|か|け|こ)|(?:という|といった|と呼ばれる)(?:語|言葉|表現|文字列)|という表現|と記され|と言った|と述べた|という本)|\b(?:the (?:word|phrase|term|name)|named|entitled|(?:is|was|are|were|be|been|being)\s+called)\b/iu;
const nameCue=/(?:名|称)(?:は|が|を|に|へ|と|も|で|の|だけ|など|って|[:：])|(?:^|[^\p{Script=Han}])(?:題|表題|標題|副題)(?:は|が|を|に|へ|と|も|で|の|だけ|など|って|[:：])|名(?:付|づ)け/u;
const correctionCue=/(?:ではなく|じゃなく|ではない|じゃない|から|を)[^。！？!?\r\n]{0,48}(?:に|へ)(?:直(?:す|さ|し|せ|そ|っ)|変(?:え|える)|改(?:め|める))/u;
// Exact-copy directives are DATA, never instructions to this module. Their payload
// can span lines/sentences and have no unambiguous end: conservatively protect this
// entire input for NEW batch entries, including text before the cue. No blank-line
// or sentence heuristic silently releases a requested literal copy.
const exactCopyCue=/(?:そのまま|一字も変えず|一文字も変えず|変更せず|改変せず|原文どおり|原文通り|正確に)[\s\S]{0,80}(?:コピー|コピペ|入力|転記|引用|写す|写し|記入|貼り付け|表示|出力|保持|残す|残し|記載)|(?:コピー|コピペ|入力|転記|引用|写す|写し|記入|貼り付け|表示|出力|保持|残す|残し|記載)[\s\S]{0,80}(?:そのまま|一字も変えず|一文字も変えず|変更せず|改変せず|原文どおり|原文通り)|(?:以下|下記|次の|後続|上記|直前|前の)[^。！？!?\r\n]{0,48}(?:文|行|内容|テキスト)[^。！？!?\r\n]{0,48}(?:コピー|コピペ|転記|写す|写し|貼り付け)/u;
let cached:Context|undefined;
function contextFor(text:string):Context {
 if(cached?.text===text)return cached;
 const boundaries=new Set<number>([0,text.length]);
 for(const token of segmenter.segment(text)){boundaries.add(token.index);boundaries.add(token.index+token.segment.length);}
 const spans:Span[]=[];
 // Inherited r29 quote, URL, email, numeral and company-name protections remain.
 // Additional paired brackets cover tested title/literal conventions across lines.
 const patterns=[/https?:\/\/[^\s「」『』<>]+/g,/www\.[^\s「」『』<>]+/g,/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,/[0-9０-９]+(?:[.,，．:/\-][0-9０-９]+)*/g,
 /`[^`]*`|"[^"]*"|“[^”]*”|「[^」]*」|『[^』]*』|‘[^’]*’/g,/(?:^|[\s(])'[^'\n]+'(?=$|[\s),.!?])/g,
 /(?:株式会社|有限会社)[^\s、。！？\n]{1,40}/g,/[^\s、。！？\n]{1,40}(?:株式会社|有限会社)/g,
 ];
 for(const re of patterns)for(const match of text.matchAll(re))spans.push({start:match.index!,end:match.index!+match[0].length,reason:'protected_source'});
 // A stack per added delimiter preserves nested and cross-line pairs. An
 // unmatched opening conservatively protects the remainder for this batch.
 for(const [open,close] of [['【','】'],['〈','〉'],['《','》'],['［','］'],['〔','〕'],['«','»'],['‹','›']]){
  const stack:number[]=[];
  for(let i=0;i<text.length;i++){
   if(text[i]===open)stack.push(i);
   else if(text[i]===close&&stack.length)spans.push({start:stack.pop()!,end:i+1,reason:'protected_source'});
  }
  for(const start of stack)spans.push({start,end:text.length,reason:'protected_source'});
 }
 for(const match of text.matchAll(/[^。！？.!?\r\n]+[。！？.!?]?/g)){
  if(literalCue.test(match[0])||nameCue.test(match[0])||correctionCue.test(match[0]))spans.push({start:match.index!,end:match.index!+match[0].length,reason:'literal_text_context'});
 }
 // A standalone literal/title label introduces following lines without a
 // reliable terminator. Preserve its remaining payload, even across blank lines.
 for(const match of text.matchAll(/^[\t ]*(?:(?:入力|記入|表示|出力|解答)例|例文|原文|訳文|見出し|題名|タイトル|ラベル|文字列|文言|本文)[\t ]*[:：]?[\t ]*(?:\r?\n|\r)/gm))spans.push({start:match.index!,end:text.length,reason:'literal_text_context'});
 // An unquoted literal can include its own full stop before the mention cue.
 for(const match of text.matchAll(/[^。！？.!?\r\n]+[。！？!?]\s*(?:という|といった|と呼ばれる)(?:文|語|言葉|表現|文字列)/g))spans.push({start:match.index!,end:match.index!+match[0].length,reason:'literal_text_context'});
 cached={text,boundaries,spans,exactCopy:exactCopyCue.test(text)};
 return cached;
}
/** Optional caller-supplied existingTarget is diagnostic source-priority evidence.
 * Do not load or merge old dictionaries here: the integrator owns full table priority.
 */
export function diagnoseJapaneseFrequentContext(text:string,start:number,end:number,style:string,options:{existingTarget?:string}={}):JapaneseFrequentContextDiagnostic {
 const source=text.slice(start,end);
 const base={start,end,source,style};
 const reject=(reason:JapaneseFrequentContextReason,extra:Partial<JapaneseFrequentContextDiagnostic>={}):JapaneseFrequentContextDiagnostic=>({...base,...extra,allowed:false,reason});
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>text.length)return reject('invalid_span');
 if(style!=='business'&&style!=='academic'&&style!=='casual')return reject('unsupported_style');
 const rule=rulesBySource.get(source);
 if(!rule){const excluded=excludedBySource.get(source);return reject(excluded?.reason??'unknown_source',excluded?{ruleId:excluded.id}:{});}
 const target=rule.targets[style as JapaneseFrequentStyle];
 const detail={ruleId:rule.id,family:rule.family,head:rule.head,target};
 if(!target)return reject('unsupported_style',detail);
 if(options.existingTarget!==undefined)return reject('existing_source_priority',{...detail,existingTarget:options.existingTarget});
 const context=contextFor(text);
 if(!context.boundaries.has(start)||!context.boundaries.has(end))return reject('source_word_boundary',detail);
 if(context.exactCopy)return reject('exact_copy_context',detail);
 const protectedSpan=context.spans.find(span=>start<span.end&&end>span.start);
 if(protectedSpan)return reject(protectedSpan.reason,detail);
 if(rule.left&&!rule.left.test(text.slice(0,start)))return reject('unadmitted_left_context',detail);
 if(!rule.right.test(text.slice(end)))return reject('unadmitted_right_context',detail);
 let stop=end;while(stop<text.length&&!sentenceStop.test(text[stop]))stop++;
 const suffix=text.slice(end,stop);
 if(negativeOrScope.test(suffix))return reject('negative_or_scope_continuation',detail);
 if(rule.head==='とても'&&impossibilityScope.test(suffix))return reject('impossibility_scope_continuation',detail);
 if(rule.guard==='affirmative'&&negativeOrScope.test(rule.source))return reject('invalid_affirmative_phrase',detail);
 return {...base,...detail,allowed:true,reason:null};
}
export function allowsJapaneseFrequentContext(text:string,start:number,end:number,style:string,onDiagnostic?:(result:JapaneseFrequentContextDiagnostic)=>void):boolean {
 const result=diagnoseJapaneseFrequentContext(text,start,end,style);
 onDiagnostic?.(result);
 return result.allowed;
}
