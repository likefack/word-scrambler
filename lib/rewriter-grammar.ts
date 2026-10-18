/** Conservative edit-boundary checks. These detect selected hazards; they are not
 * a grammar parser or proof of semantic equivalence. A failed check abstains. */
export type GrammarRejection = 'context_duplicate'|'grammar_join'|'scope_change'|'semantic_attribute';
function duplicatedPairs(value:string,particlesOnly=false){
  const tokens=[...new Intl.Segmenter('ja',{granularity:'word'}).segment(value)].filter(x=>x.isWordLike),counts=new Map<string,number>();
  for(let i=1;i<tokens.length;i++){
    const token=tokens[i].segment.toLowerCase(),previous=tokens[i-1];
    const eligible=particlesOnly?/^[がをにはへとでの]$/u.test(token):(/^[a-z]+$/i.test(token)||token.length>=2);
    if(eligible&&token===previous.segment.toLowerCase()&&/^\s*$/u.test(value.slice(previous.index+previous.segment.length,tokens[i].index)))counts.set(token,(counts.get(token)??0)+1);
  }
  return counts;
}
function introducedDuplicate(source:string,output:string,particlesOnly=false){const before=duplicatedPairs(source,particlesOnly);return [...duplicatedPairs(output,particlesOnly)].some(([word,count])=>count>(before.get(word)??0));}
const JAPANESE_SCOPE = [
  /(?:何か|誰か|どこか|いつか)/u, /(?:何も|誰も|どこも)/u,
  /(?:すべて|全て|全部|あらゆる)/u, /(?:必ず|絶対|間違いなく)/u,
  /(?:かもしれ|おそらく|恐らく|たぶん|多分)/u,
  /(?:いつも|常に|毎回|決して)/u,
  /(?:なければなら|なくてはなら|べき|必要がある)/u,
  /(?:ない|なかった|なくな|ません)/u,
];
const ENGLISH_SCOPE = [
  /\b(?:always|every|everyone|everything|all)\b/i, /\b(?:never|nobody|nothing|none)\b/i,
  /\b(?:perhaps|probably|possibly|maybe|might)\b/i, /\b(?:certainly|definitely|undoubtedly)\b/i,
  /\b(?:must|shall)\b/i, /\b(?:not|cannot|can't|won't|isn't|aren't|didn't|doesn't|don't)\b/i,
];
const FEATURES = [
  // Freshness and temperature are independent properties; one cannot stand in
  // for the other merely because freshly prepared food is often warm.
  /(?:焼き[た立]て|焼いたばかり|焼き上がったばかり|炊き[た立]て|炊いたばかり|でき[た立]て|出来[た立]て|作り[た立]て|作ったばかり|仕上がったばかり)|\b(?:freshly (?:baked|made|cooked|prepared)|just (?:baked|made|cooked|prepared))\b/iu,
  /(?:新鮮|フレッシュ)|\bfresh\b/iu,
  /(?:穏やか|おだやか|のどか|落ち着い)|\b(?:calm|peaceful|tranquil)\b/iu,
  /(?:静か|静けさ|静寂|物静か)|\b(?:quiet|silent|silence)\b/iu,
  /(?:ひんやり|涼し|少し冷た)|\b(?:cool|chilly)\b/iu,
  /(?:熱々|熱い|熱く|あつあつ)|\b(?:hot|steaming)\b/iu,
  /(?:清々し|すがすがし|爽やか|さわやか|心地よ|気持ち[良よ])|\b(?:refreshing|pleasant)\b/iu,
];
export function unsafeEditReason(text:string,original:string,replacement:string,start:number,end:number):GrammarRejection|undefined{
  const left=text.slice(Math.max(0,start-80),start),right=text.slice(end,end+80);
  if(introducedDuplicate(left+original+right,left+replacement+right))return 'context_duplicate';
  const ja=/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(original+replacement);
  if(ja){
    // A noun/adverb followed by suru inflection cannot be replaced with an
    // already finite predicate: “…なるして”, “…しいして”, “…てして”.
    const suruTail=/^(?:する|すれ|し(?:て|た|ない|なかっ|ます|まし|ません|よう)|せず|せよ)/u.test(right);
    if(suruTail&&/(?:る|い|た|て|だ|です|ます)$/u.test(replacement)&&!/(?:る|い|た|て|だ|です|ます)$/u.test(original))return 'grammar_join';
    // Preserve the conjugation slot when only an adjective stem is replaced.
    if(/^(?:て|た|ない|なかっ)/u.test(right)&&/く$/u.test(original)&&/[いだな]$/u.test(replacement))return 'grammar_join';
    if(/^な(?:る|っ|り|ら|れ)/u.test(right)&&/[くに]$/u.test(original)&&!/[くに]$/u.test(replacement))return 'grammar_join';
    if(/^(?:に|な)/u.test(right)&&/[いな]$/u.test(replacement)&&!/[いな]$/u.test(original))return 'grammar_join';
    // Do not add another complete predicate while leaving a source predicate's
    // stem suffix outside the edit. Prefer a complete inflected phrase instead.
    if(/^(?:して|した|します|でした|です)/u.test(right)&&/(?:して|した|します|でした|です)$/u.test(replacement))return 'grammar_join';
  }
  const scopes=ja?JAPANESE_SCOPE:ENGLISH_SCOPE;
  if(scopes.some(pattern=>pattern.test(original)!==pattern.test(replacement)))return 'scope_change';
  if(FEATURES.some(pattern=>pattern.test(original)!==pattern.test(replacement)))return 'semantic_attribute';
  return undefined;
}
export function unsafeReconstructionReason(source:string,output:string):GrammarRejection|undefined{
  if(introducedDuplicate(source,output))return 'context_duplicate';
  // Check actual repeated particle tokens, not character pairs inside words
  // such as ものの or ordinary combinations such as には/では.
  if(introducedDuplicate(source,output,true))return 'grammar_join';
  return undefined;
}
