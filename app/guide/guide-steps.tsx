// Static guide component; import into app/guide/page.tsx after copying the assets.
const steps = [
  {
    "number": 1,
    "file": "01-groq-login.png",
    "kind": "screenshot",
    "title": "登録・ログインする",
    "body": "Groq公式のキー取得ページを開き、本人のアカウントでログインします。初めて使う場合は、表示される利用条件を確認して登録します。Google、GitHub、メールなど、自分が使う方法を選んでください。メール確認などを求められた場合は、その案内に従います。",
    "alt": "Groqのログイン画面。Google、GitHub、SSO、メールの選択肢を赤い丸で囲み、番号1の矢印を付けています。",
    "caption": "実画面に注釈を追加。ログイン方法や認証画面は利用する方法によって異なります。",
    "width": 1569,
    "height": 1002,
    "bytes": 1141191
  },
  {
    "number": 2,
    "file": "02-groq-api-keys.png",
    "kind": "screenshot",
    "title": "API Keysページを開く",
    "body": "ログイン後に別のページが開いたら、「API Keys」（日本語表示は「APIキー」）を選びます。スマホではメニュー内にある場合があります。見つからないときは、このガイドの「Groq公式のキー取得ページ」をもう一度開いてください。",
    "alt": "Groqの上部メニュー実画面。「API Keys」リンクを赤い丸と番号2の矢印で示しています。",
    "caption": "PCの上部メニューを示す実画面に注釈。撮影はログイン前のため、右端はLog Inと表示されています。スマホでは配置が変わります。",
    "width": 2172,
    "height": 724,
    "bytes": 1002811
  },
  {
    "number": 3,
    "file": "03-groq-create-key.png",
    "kind": "screenshot",
    "title": "「Create API Key」を選ぶ",
    "body": "利用する組織・プロジェクトを確認し、「Create API Key」（日本語表示は「APIキーを作成する」）を押します。管理権限がない場合は作成できません。所有者またはdeveloper権限が必要です。",
    "alt": "GroqのAPIキー管理画面の一部。「APIキーを作成する」ボタンを赤い丸と番号3の矢印で示しています。",
    "caption": "実画面をトリミングして注釈。キー実値・アカウント情報・既存キーの一覧は載せていません。",
    "width": 1547,
    "height": 1016,
    "bytes": 1584984
  },
  {
    "number": 4,
    "file": "04-name-expiry-diagram.png",
    "kind": "diagram",
    "title": "名前・有効期限を確認して作成する",
    "body": "キーの名前を求められたら「expression-scrambler-test」など、あとで用途が分かる名前を入力します。有効期限の設定が表示された場合は、必要な利用期間に合わせて選びます。内容を確認して、画面の作成・確定ボタンを押します。項目名や選択肢は実際のGroq画面に従ってください。",
    "alt": "説明図。名前欄に用途が分かる名前を入力し、有効期限が表示された場合は必要な期間を選び、作成を確定する流れを示しています。実際のGroq画面ではありません。",
    "caption": "説明図（実画面ではありません）。名前・期限の入力位置や選択肢は実際の画面と異なります。",
    "width": 1536,
    "height": 1024,
    "bytes": 1234372
  },
  {
    "number": 5,
    "file": "05-copy-key-diagram.png",
    "kind": "diagram",
    "title": "表示されたキーをコピーする",
    "body": "作成後に表示されたキーのコピーボタンを押します。この図の例文ではなく、自分のGroq画面に表示されたキーをコピーしてください。コピー後は表現スクランブラへ戻ります。キーをチャット、メール、スクリーンショット、公開コードに載せないでください。",
    "alt": "説明図。自分のキーが表示される領域の横にあるコピー操作を、赤い丸と番号5の矢印で示しています。キー実値は載せていません。",
    "caption": "説明図（実画面ではありません）。コピー位置・文言は実際の画面で確認してください。",
    "width": 1536,
    "height": 1024,
    "bytes": 1220927
  },
  {
    "number": 6,
    "file": "06-app-ai-mode.png",
    "kind": "screenshot",
    "title": "「AI変換」を選ぶ",
    "body": "表現スクランブラのツール画面に戻り、「AI変換」を選びます。すでに選択されていれば、そのまま次へ進みます。「辞書変換（簡易）」にはキーは不要です。",
    "alt": "表現スクランブラの変換方法の実画面。「AI変換」タブを赤い丸と番号6の矢印で示しています。",
    "caption": "表現スクランブラの実画面に注釈。AI変換が選択された状態です。",
    "width": 1933,
    "height": 813,
    "bytes": 1221204
  },
  {
    "number": 7,
    "file": "07-app-paste-key.png",
    "kind": "screenshot",
    "title": "「Groq APIキー」欄へ貼り付ける",
    "body": "Groqでコピーしたキーを「Groq APIキー」の入力欄へ貼り付けます。スマホは入力欄を長押しして「貼り付け」、PCはCtrl+V、Macは⌘+Vを使えます。入力したキーは伏せ字になります。貼り付けただけではAPIリクエストは送信しません。",
    "alt": "表現スクランブラの実画面。空のGroq APIキー入力欄を赤い丸と番号7の矢印で示しています。",
    "caption": "実画面に注釈。図の入力欄は空で、キー実値は載せていません。",
    "width": 1578,
    "height": 996,
    "bytes": 1222721
  },
  {
    "number": 8,
    "file": "08-app-consent.png",
    "kind": "screenshot",
    "title": "送信先・利用条件を確認する",
    "body": "欄の下の説明を読み、同意する場合だけ「送信先と利用条件を確認し、自分のキーで実行します」にチェックを入れます。実行時にはキーと文章がこのサイトのサーバー経由でGroqへ送信され、利用枠・料金は自分のGroq契約に従います。",
    "alt": "表現スクランブラの実画面。送信先と利用条件を確認する同意チェック欄を赤い丸と番号8の矢印で示しています。",
    "caption": "実画面に注釈。図では未チェックの状態です。",
    "width": 1560,
    "height": 1008,
    "bytes": 1212609
  },
  {
    "number": 9,
    "file": "09-app-input.png",
    "kind": "screenshot",
    "title": "置き換えたい文章を入力する",
    "body": "「入力」に日本語または英語の文章を入れます。4語以上、3,000文字以内です。個人情報や機密情報は入力しないでください。動きを確かめるだけなら「サンプルを入力」から文章を選べます。",
    "alt": "表現スクランブラの入力パネル実画面。文章の入力領域を赤い枠と番号9の矢印で示しています。",
    "caption": "実画面をもとに入力範囲を強調。図は文章を入力する前の状態です。",
    "width": 1454,
    "height": 1082,
    "bytes": 1065948
  },
  {
    "number": 10,
    "file": "10-app-run.png",
    "kind": "screenshot",
    "title": "準備ができたら「Groqで置き換える」",
    "body": "キー、同意チェック、文章を確認し、「Groqで置き換える」を押します。利用規約とデータの扱いも確認してください。「本文を含まない診断情報を送信する」は任意で、オフでも変換できます。結果が出たら原文と比べて確認します。実行できないときは、入力欄の下に表示されるエラーを確認してください。使用後は上の「キーを消去」を押します。",
    "alt": "表現スクランブラの実行前の実画面。「Groqで置き換える」ボタンを赤い丸と番号10の矢印で示しています。図は未入力のためボタンが無効です。",
    "caption": "実画面に注釈。撮影ではキーや文章を入れていないためボタンは無効です。実際に実行するとGroqに送信されます。",
    "width": 1742,
    "height": 903,
    "bytes": 1237523
  }
] as const;
export function GuideSteps({from,to}:{from:number;to:number}){
  return <ol className="key-steps">
    {steps.filter(step=>step.number>=from&&step.number<=to).map(step=><li key={step.number} id={`key-step-${step.number}`}>
      <strong>{step.number}. {step.title}</strong>
      <p>{step.body}</p>
      <figure className="guide-shot">
        <a href={`/guide/steps/${step.file}`} target="_blank" rel="noopener noreferrer" aria-label={`${step.number}. ${step.title}の図を拡大する`}>
          <img src={`/guide/steps/${step.file}`} width={step.width} height={step.height} loading="lazy" decoding="async" alt={step.alt}/>
        </a>
        <figcaption><span className={step.kind==='diagram'?'guide-figure-tag diagram':'guide-figure-tag'}>{step.kind==='diagram'?'説明図':'実画面に注釈'}</span>図{step.number}：{step.caption} 画像を押すと拡大できます。</figcaption>
      </figure>
    </li>)}
  </ol>;
}
