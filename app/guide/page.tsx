import type { Metadata } from 'next';
import './guide.css';
import { OWNER_KEY_MODE_ENABLED } from '../../lib/features';

export const metadata: Metadata = {title:'Groq APIキーの取得・使用手順 | 表現スクランブラ',description:'自分のGroq APIキーを取得して表現スクランブラで使う手順。料金、送信先、キーの取り扱い。'};
const External = ({href,children}:{href:string;children:React.ReactNode}) => <a href={href} target="_blank" rel="noreferrer noopener">{children} ↗</a>;
export default function Guide(){return <main className="key-guide">
  <nav><a href="/">← 表現スクランブラへ戻る</a></nav>
  <header><p>GROQ API / 使用手順</p><h1>自分のAPIキーで実行する</h1><p>機械的な辞書置換にはキーは不要です。以下は、任意のGroq AI処理を使う場合の手順です。</p></header>
  <aside><strong>キーはパスワードと同様に扱います。</strong><p>チャット、メール、スクリーンショット、公開コードにキーを載せないでください。このガイドにはキーを入力する欄はありません。</p></aside>
  <section><h2>1. Groqでキーを作成する</h2><ol>
    <li><External href="https://console.groq.com/keys">Groq公式のAPI Keysページ</External>を開き、本人のアカウントでログインします。アカウントがなければ、表示される登録条件を確認して作成します。</li>
    <li>画面上部の組織・プロジェクトを確認します。複数ある場合は、この実験で利用するものを選びます。キーは選択中のプロジェクトに属します。</li>
    <li>「Create API Key」を選択します。名前を求められた場合は「word-scrambler-test」など用途を識別できる名前を指定し、画面の手順に従って作成します。キーの管理には所有者またはdeveloper権限が必要です。</li>
    <li>表示されたキーをコピーし、本人が管理する安全な場所で扱います。他人に共有しないでください。表示できなくなった場合は、必要に応じて新しいキーを作成し、不要なキーを失効します。</li>
  </ol><p className="reference">参照：<External href="https://console.groq.com/docs/quickstart">Groq Quickstart</External> / <External href="https://console.groq.com/docs/projects">Projects</External></p></section>
  <section><h2>2. 利用枠・料金を確認する</h2><p>「Free」はアカウントのプランであり、専用のキー種別ではありません。現在のプランと上限をGroq側で確認します。有料利用を意図しない場合は、「Upgrade」や支払い方法の登録を進めないでください。</p><p>APIの利用枠は契約・プロジェクト・モデルに依存します。上限に達すると処理が拒否される場合があります。このサイトには決済機能がありませんが、有料プランのキーで実行すれば、その契約に従って費用が発生し得ます。</p><p className="reference"><External href="https://console.groq.com/docs/rate-limits">利用上限</External> / <External href="https://console.groq.com/docs/billing-faqs">料金・プラン</External></p></section>
  <section><h2>3. 表現スクランブラで実行する</h2><ol>
    <li><a href="/">ツール画面</a>で「AI・自分のキー」を選択します。</li>
    <li>パスワード形式の「Groq APIキー」欄にキーを貼り付けます。貼り付けただけでは、APIリクエストは送信しません。</li>
    <li>送信先と利用条件を確認し、チェック欄を選択します。処理対象の日本語または英語を入力します。上限は3,000文字、下限は4語です。</li>
    <li>「Groq APIで実行」を押すと、キーと入力文がこのサイトのサーバーを経由してGroqに送信されます。結果・変更率を確認します。</li>
    <li>使用後は「キーを消去」を押します。入力キーはページの一時メモリで保持し、再読み込みでも消えます。アプリはブラウザ保存領域やデータベースへの保存、キー・本文のログ記録を実装していません。</li>
  </ol><p>ブラウザのパスワード保存、拡張機能、端末のクリップボード、ホスティング基盤まで含む非保存・漏えい防止は保証できません。共有端末や信頼できない環境で使用しないでください。</p></section>
  <section><h2>4. エラー・キー漏えいへの対応</h2><ul>
    <li>認証エラー：キーの入力、失効状態、選択した組織・プロジェクトの権限をGroqで確認します。</li>
    <li>利用上限・混雑：時間を空けるか、キー不要の「機械的な置換」を選びます。自動で有料プランに切り替える機能はありません。</li>
    <li>タイムアウト・応答形式エラー：画面の「診断情報」でコード・処理段階・HTTP/Groqステータスを確認できます。「診断情報をコピー」はコード、ID、版、段階、ステータス、時刻だけをコピーし、入力文やキーは含めません。再試行もAPI利用に数えられます。</li>
    <li>キーを公開した・他人に渡した可能性がある：<External href="https://console.groq.com/keys">GroqのAPI Keys</External>で該当キーを直ちに失効し、必要なら新しいキーを作成します。利用状況も確認します。</li>
  </ul><p className="reference"><External href="https://console.groq.com/docs/production-readiness/security-onboarding">Groqのキー管理・セキュリティ</External> / <External href="https://console.groq.com/docs/your-data">データの取り扱い</External></p></section>
  {OWNER_KEY_MODE_ENABLED&&<section><h2>「AI・提供者のキー」について</h2><p>サーバーの秘密情報として提供者のキーが設定されている場合に限り利用できます。現在は未設定のため実行できません。設定するための安全なプラットフォーム入力経路は、このツールには用意していません。チャットや「自分のキー」欄への貼り付けでは、提供者キーの登録にはなりません。</p><p>設定後に使う場合は、提供者のGroq利用枠・料金が消費されます。別モードのキーへ自動的に切り替えることはありません。</p></section>}

  <footer><span>© 2026 codeswitcher</span><span>作成者：自我巨大児</span><a href="/">表現スクランブラへ戻る</a><span>手順・公式資料確認：2026-10-18。Groqの画面は変更される場合があります。</span></footer>
</main>;}
