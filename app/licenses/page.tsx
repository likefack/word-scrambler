import '../legal.css';
export const metadata = {title:'ライセンス・出典 | 表現スクランブラ'};
const External = ({href,children}:{href:string;children:React.ReactNode}) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
export default function Licenses(){return <main className="legal-document">
  <nav><a href="/">← 表現スクランブラへ戻る</a></nav>
  <h1>ライセンス・出典</h1>
  <section><h2>プログラムと追加辞書</h2>
    <p>プログラムは<a href="/licenses/MIT-LICENSE.txt">MITライセンス</a>です。一部の追加辞書データには、別の利用条件が適用されます。</p>
    <p>追加辞書データは <External href="https://creativecommons.org/licenses/by-sa/4.0/deed.ja">CC BY-SA 4.0</External> で提供します。再配布・改変する際は、出典と変更点を示し、改変したデータにも同じライセンスを適用してください。対象は presets-en-broad.ts、presets-ja-broad.ts、presets-broad-scopes.ts の辞書データです。入力文や変換結果に、この辞書のライセンスを適用するものではありません。</p>
    <p>語句の選定、言い換えの方向、文体・接続条件の追加を行っています。詳しい対象範囲と原文の条件は、<a href="/licenses/DATA-LICENSE.md">追加辞書のライセンス</a>をご確認ください。</p>
  </section>
  <section><h2>辞書の出典</h2>
    <ul>
      <li><External href="https://wordnet.princeton.edu/">Princeton WordNet 3.1</External> — Princeton University。<a href="/licenses/Princeton-WordNet-LICENSE.txt">原ライセンス</a></li>
      <li><External href="https://bond-lab.github.io/wnja/">日本語WordNet</External> — 情報通信研究機構（NICT）。<a href="/licenses/Japanese-WordNet-LICENSE.txt">原ライセンス</a></li>
      <li><External href="https://github.com/rspeer/wordfreq">wordfreq 3.1.1</External> — Robyn Speer。語句の選定時に頻度情報を参照しています。<a href="/licenses/wordfreq-NOTICE.md">帰属・データ出典</a>／<a href="/licenses/wordfreq-LICENSE.txt">ソフトウェアのライセンス</a></li>
    </ul>
    <p>wordfreqの出典にはGoogle Books Ngrams、Leeds Internet Corpus、Wikipedia、ParaCrawl、OpenSubtitles、Marc BrysbaertほかによるSUBTLEXが含まれます。SUBTLEXは無償で利用できるデータです。元の帰属表示は上記リンクに収録しています。</p>
  </section>
  <section><h2>用例の確認に参照した資料</h2>
    <p>Universal Dependencies r2.18 の <External href="https://github.com/UniversalDependencies/UD_English-EWT/tree/r2.18">English EWT</External> と <External href="https://github.com/UniversalDependencies/UD_Japanese-GSD/tree/r2.18">Japanese GSD</External> を参照しています。収録文をアプリの辞書に転載していません。</p>
    <p>EWT：<a href="/licenses/UD-en-README.md">帰属表示</a>／<a href="/licenses/UD-en-LICENSE.txt">利用条件</a> · GSD：<a href="/licenses/UD-ja-README.md">帰属表示</a>／<a href="/licenses/UD-ja-LICENSE.txt">利用条件</a></p>
  </section>
  <section><h2>辞書整備に利用したツール</h2>
    <p>SudachiPy・SudachiDictのライセンス：<a href="/licenses/SudachiPy-LICENSE.txt">Apache 2.0</a>／<a href="/licenses/SudachiDict-LEGAL.txt">辞書の権利表示</a></p>
  </section>
  <footer><a href="/">表現スクランブラへ戻る</a><a href="https://github.com/likefack/word-scrambler" target="_blank" rel="noopener noreferrer">ソースコード（GitHub）</a><p>© 2026 codeswitcher · 作成者：自我巨大児</p></footer>
</main>;}
