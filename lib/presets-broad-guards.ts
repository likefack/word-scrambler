// SPDX-License-Identifier: MIT
/** Conservative source-only scope for reviewed ordinary noun directions. Not a sense/POS parser. */
export type BroadGuard = 'none' | 'ja-standalone' | 'ja-nominal-tail' | 'ja-suru-tail' | 'ja-complete-entry' | 'en-sofa-compound';
const compoundCharacter = /[\p{Script=Han}\p{Script=Katakana}\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{N}ー々〆ヵヶ]/u;
const endOrPunctuation = /^[\s、。，．！？!?;；:：)）\]】}」』“”‘’"'…]/u;
const nominalTail = /^(?:が|は|を|に|へ|と|の|も|や|か|で|だ|じゃ|から|まで|より|ほど|だけ|ばかり|さえ|すら|など|なんて|なら|って|たち)/u;
const suruTail = /^(?:する|した|して|しない|しなかった|しなく|しなけれ|しません|しました|します|しましょう|しよう|すれば|せず|され|させ|でき|出来|し(?:得|うる|やす|にく|づら|始め|終え|直|続け|忘れ|終わ|に|つつ|ながら)|し(?=[\s、。，．！？!?;；:：]|$))/u;
const explicitMentionTail = /^(?:(?:など|なんて)?(?:と|って)(?:書|か[きくけこいか]|記|しる|表記|表示|印字|印刷|記載|呼|よ[ぶばびん])|という|といった|の(?:文字|表記|語句|語|名称|名前))/u;
function clauseAround(text:string,start:number,end:number):string {
 const left=text.slice(0,start).split(/[。！？!?\n]/u).at(-1)??'';
 const right=text.slice(end).split(/[。！？!?\n]/u)[0]??'';
 return left+text.slice(start,end)+right;
}
export function allowsBroadMatch(text:string,start:number,end:number,guard:BroadGuard):boolean {
 if (guard==='none')return true;
 if (guard==='en-sofa-compound')return !/^\s+bed(?:s)?(?:\b|$)/iu.test(text.slice(end));
 const before=Array.from(text.slice(0,start)).at(-1)??'',after=text.slice(end),next=Array.from(after)[0]??'';
 if(guard!=='ja-complete-entry'&&(compoundCharacter.test(before)||compoundCharacter.test(next)))return false;
 if(before==='お'||before==='ご')return false;
 if(explicitMentionTail.test(after))return false;
 // A following と/って can introduce a literal reported word with arbitrary
 // intervening adverbs. Do not guess between quotation and coordination.
 // Known cost: 知人と話す / 準備と掃除 also abstain under this scope.
 if(/^[、,]?\s*(?:と|って)/u.test(after))return false;
 // Direct input/inscription reports without quotation marks. The lexical
 // candidate must be the nearby object; ordinary 地図を読む is not rejected.
 if(/^(?:を|も|だけを|のみを)(?:かいた|かいて|かく|かき(?:こ|込)|かかれ)/u.test(after))return false;
 if(/^を[^。！？!?\n]{0,48}(?:入力|タイプ|書(?:く|い|き|か|け|こ)|記(?:す|し|さ)|印字|表記|記載|表示)/u.test(after))return false;
 // Written-word replacement/notation reports are conservatively left unchanged.
 // This can also abstain on a description of replacing a real activity; that is
 // a disclosed coverage cost rather than permission to alter literal wording.
 // A whole sentence describing text/UI/editing is conservatively excluded.
 // This deliberately trades ordinary reporting opportunities for exact wording.
 if(/(?:言い換え|書き換え|書換|置き換え|置換|差し替え|答案|解答|正答|正解|一言|発言|語句|単語|文字|文言|文章|例文|本文|文中|文では|文には|動詞|名詞|形容詞|副詞|助詞|助動詞|述語|主語|言葉|表記|名称|名前|ラベル|見出し|題名|タイトル|項目|メニュー|ボタン|欄|掲示|看板|画面|入力|タイプ|訂正|修正|校正|記載|印字|印刷|表示|発音|書(?:く|い|き|か|け|こ))/u.test(clauseAround(text,start,end)))return false;
 // Names, titles, and appellations may be described without quotation marks.
 // Use nominal name/title heads + case/topic attachment, including 曲名/愛称.
 // 題 must not be a suffix inside ordinary 問題/課題/話題 compounds.
 if(/(?:名|称)(?:は|が|を|に|へ|と|も|で|の|だけ|など|って|[:：])|(?:^|[^\p{Script=Han}])(?:題|表題|標題|副題)(?:は|が|を|に|へ|と|も|で|の|だけ|など|って|[:：])|名(?:付|づ)け/u.test(clauseAround(text,start,end)))return false;
 // An explicit X-to-Y correction can report unquoted literal wording.
 if(/(?:ではなく|じゃなく|ではない|じゃない|から|を)[^。！？!?\n]{0,48}(?:に|へ)(?:直(?:す|さ|し|せ|そ|っ)|変(?:え|える)|改(?:め|める))/u.test(clauseAround(text,start,end)))return false;
 // Complete reviewed predicates/adverbs already include their inflection.
 // Their ordinary complements are not mistaken for nominal suffixes. Existing
 // public boundary/compound/honorific guards still run before this scope.
 if(guard==='ja-complete-entry'){
  // A complete finite predicate immediately followed by a copula commonly
  // denotes the wording itself. Organization suffixes may form an unquoted
  // name; conservative abstention also covers some ordinary relative clauses.
  if(/^(?:を|では|じゃ|だった|です|でした|である|だろう|だっ|だ[。！？!?、,]|会|会社|協会|団体|財団|組合|法人|連盟)/u.test(after))return false;
  return true;
 }
 if(guard==='ja-suru-tail')return suruTail.test(after);
 if(/^(?:にく|やす|づら|がち|だす|だし(?:た|て|ま)|ながら|たが|つつ)/u.test(after))return false;
 if(guard==='ja-nominal-tail')return !after||endOrPunctuation.test(after)||nominalTail.test(after);
 // The selected sources are lexical nouns, not ambiguous verb continuatives.
 // Unknown hiragana continuations (e.g. 準備ばんたん) are not noun evidence.
 if(guard==='ja-standalone')return !after||endOrPunctuation.test(after)||nominalTail.test(after)||suruTail.test(after);
 return false;
}
