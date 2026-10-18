// SPDX-License-Identifier: MIT
/** MIT. Additional source-side writing-context veto for this new batch only.
 * Earlier registered entries retain their existing behavior. No input mutation.
 */
export function allowsNewJapaneseLiteralContext(text:string,start:number,end:number,target?:string):boolean {
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>text.length)return false;
 let left=start,right=end;
 while(left>0&&!/[。！？!?]/u.test(text[left-1]))left--;
 while(right<text.length&&!/[。！？!?]/u.test(text[right]))right++;
 // 記す and its regular stem forms are literal-recording cues. Include common
 // writing/inscription nouns explicitly; do not catch ordinary 記者/記事.
 // Do not collapse two explicitly co-occurring alternative expressions into
 // the same surface, including cross-sentence contrasts. This is pair-aware protection, not
 // a claim to parse the author's metalinguistic intent. It can withhold an
 // otherwise safe ordinary rewrite when its target already appears nearby.
 if(target){let at=text.indexOf(target);while(at>=0){if(at>=end||at+target.length<=start)return false;at=text.indexOf(target,at+target.length);}}
 const writing=/(?:記(?:す|し|さ|せ|そ)|しる(?:す|し|さ|せ|そ)|記入|記録|筆記|書き記|書き留|書きとめ|刻印|銘記)/u;
 if(writing.test(text.slice(left,right)))return false;
 // A quoted-by-report literal may include its own punctuation before と記す.
 if(/^[。！？!?][\s]*(?:と|って)[\s]*(?:記(?:す|し|さ|せ|そ)|しる(?:す|し|さ|せ|そ)|記入|記録)/u.test(text.slice(right)))return false;
 return true;
}
