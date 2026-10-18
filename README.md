# 表現スクランブラ

日本語・英語の文章を、元の文体をなるべく保ちながら部分的に言い換える実験用Webアプリです。テキストウォーターマークの撹乱に関する実験を目的としていますが、検出の回避・除去を実証するものではありません。

- 公開サイト: https://kotoba-style-rewriter.regal-raven-5622.chatgpt.site
- 作成者: 自我巨大児
- 自作部分の著作権: Copyright (c) 2026 codeswitcher
- ソースコード: https://github.com/likefack/word-scrambler
- 初回公開版: 2026-10-18 / r10ベース（表示名を「表現スクランブラ」へ変更）

このリポジトリはr10を初回公開対象とするソーススナップショットです。進行中のデザイン変更・辞書/NLP改善は含まれません。これらは後続の変更として検査・追加します。公開サイトの状態と、このソースの状態は一致しない場合があります。

## 機能と制約

- 日本語・英語、ビジネス・学術・カジュアルの文体判定
- ブラウザ内の辞書による機械的な置換
- 利用者自身のGroq APIキーを使うAI置換
- 変更箇所・原文比較・実置換率の表示と、変更の個別取り消し
- APIキー・本文を含めない、利用者の操作による診断レポート送信

約25%の語句置換を目標に改善していますが、任意の文章でこの割合に達することや、文法・意味の正確さを保証していません。置換しない方が安全と判断した候補は採用しません。評価文章に対する結果を、一般的な品質やウォーターマークに対する効果の証明として扱わないでください。

提供者キー方式は実装を保持したまま `lib/features.ts` で無効化されています。キーを設定しただけでは有効になりません。再有効化には認証・分散レート制限・利用額の制御を含む別の安全確認が必要です。

## 構成

TypeScript / React / Vinext / Cloudflare Workers / D1 / Drizzle / Groq API。

- `app/`: 画面、ガイド、APIルート
- `lib/presets*.ts`: 置換辞書とルール
- `lib/rewriter*.ts`: 入力検証、AI出力の適用、文法・文脈に関する保守的な検査
- `app/chatgpt-auth.ts`: Sitesが付与する認証済みヘッダーの読み取り
- `build/`: Workerエントリーポイント、Sites連携、開発時認証
- `drizzle/`: 診断レポート用D1スキーマ
- `tests/`: ダミー入力・ダミーキーを用いる自動テスト

## ローカル開発

必要環境はNode.js 22.13.0以上、npm、ネイティブのCloudflare Workerdを実行できるOSです。検証したNode/npmと結果は [VALIDATION.md](VALIDATION.md) を参照してください。全OS・全Nodeバージョンでの動作は未確認です。

プロジェクトのルートで実行します。

```sh
npm run setup:local
npm run install:ci
npm run dev -- --host 127.0.0.1
```

ブラウザで `http://127.0.0.1:5173` を開きます。`setup:local` は実サイトIDも秘密情報も含まない `config/hosting.local.example.json` から、無視対象の `.openai/hosting.json` を作成します。既存の設定は上書きしません。`package-lock.json` を維持し、`npm run install:ci` で固定された依存関係をインストールしてください。

ホームディレクトリに書き込めない隔離環境では、npmとWranglerの作業領域をプロジェクト配下へ指定します（POSIXシェル）。通常の環境では不要です。

```sh
export npm_config_cache="$PWD/.sites-runtime/npm-cache"
export XDG_CONFIG_HOME="$PWD/.sites-runtime/xdg-config"
```

開発サーバーにはループバック接続専用の模擬サインインがあります。ブラウザで `http://127.0.0.1:5173/signin-with-chatgpt?return_to=%2F` を開くと架空のローカルユーザーとして動作します。本番ChatGPTアカウントへの認証ではありません。開発サーバーをLAN・トンネル・公衆インターネットへ公開しないでください。

機械的な置換にはGroq APIキーは不要です。AI呼び出しを実行すると、入力本文と利用者のキーがローカルサーバーを経由してGroqへ送られ、利用者のGroq契約に従って利用枠や料金が消費されます。自動テストは実キーを使わず、Groqへのリクエストを模擬または遮断します。

### 診断レポート用のローカルDB

テーブルを作らない状態では、レポート送信は利用不可として失敗します。ローカルDBだけを初期化する例です。

```sh
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_error_reports.sql
```

この例に `--remote` を付けないでください。開発サーバーとの状態保存先が異なる環境では、同じ `persist-to` の設定を確認してください。D1保存・削除の端から端までの実動作について、未検証の範囲は [VALIDATION.md](VALIDATION.md) に明記しています。

### ビルド後の確認

```sh
npm run build
npm run start
```

`start` はビルド済みWorkerをローカルで起動します。模擬サインインを提供するVite開発サーバーとは異なり、Sitesの認証基盤は再現しません。AI・診断・ステータスAPIが未認証として拒否されるのは、この起動方法では想定内です。

## テスト

```sh
npm test
npm run test:dictionaries
npm run typecheck
npm run lint
npm run build
```

- `npm test`: `tests/*.test.mjs`。Reactハンドラーやソース検証、模擬認証、Workerd境界で遮断した外部通信などを含みます。
- `test:dictionaries`: 各辞書の保守的なサニティチェック。全文章に対する自然さや意味の同一性を検証するものではありません。
- `tests/presets-ja-expanded.dev.mjs`: 開発用評価。通常の合否判定からは分けています。
- ブラウザの実際の履歴・フォーカス・認証遷移、公開環境の設定、実Groq呼び出しを自動テストだけで保証することはできません。

## Sites以外へ配備するときの重要事項

このリポジトリは、任意のホスティングへそのまま安全に配備できる汎用テンプレートではありません。

1. `getChatGPTUser()` はSitesの信頼できる入口が設定した `oai-authenticated-user-*` ヘッダーを信頼します。この関数自体は署名やセッションを検証しません。一般のインターネットから受け取った同名ヘッダーをそのまま信頼してはいけません。
2. 別基盤では、入口で外部由来の認証ヘッダーを除去し、独立したセッション検証・認可を行い、Workerへの直接迂回を防止してください。`getChatGPTUser()` のチェックを削除する対処はしないでください。
3. `/signin-with-chatgpt`、`/signout-with-chatgpt`、`/callback` の本番動作、D1バインド、ドメイン、TLS、Secretsは配備基盤が担当します。ローカル設定例はこれらをプロビジョニングしません。
4. Origin検査はCSRF対策の一部であり、認証の代わりではありません。プロセス内の同時実行制限は分散環境の全体クォータ・費用上限ではありません。
5. Sites連携やconnector previewの補助ファイルは保持していますが、本アプリの言い換え機能は接続アプリを必要としません。実サイトの設定、プレビューセッション、トークンは同梱していません。

公開サイトは閲覧可能でも、AI・診断レポート・ステータスのAPIには認証が必要です。詳細は [SECURITY.md](SECURITY.md) を参照してください。

## データと秘密情報

機械的な置換の本文はブラウザ内で処理します。AI方式では本文とAPIキーがアプリサーバーを経由してGroqへ送られます。APIキーはアプリのローカルストレージに保存する設計ではありませんが、ブラウザ拡張、開発者ツール、ネットワーク/配備基盤を含む全経路の安全を保証するものではありません。

診断レポートは固定の項目だけを受け付け、本文、APIキー、氏名、メール、自由記述は保存対象にしません。DBの行数・保持期間は [SECURITY.md](SECURITY.md) を参照してください。実際のHTTPアクセスログ等は配備先で別途確認が必要です。

`.env*`、`.dev.vars*`、`.openai/`、`.sites-runtime/`、`.wrangler/`、ビルド結果、認証Cookie、実利用者データを公開しないでください。

## ライセンスと公開前の確認

自作部分は [MIT License](LICENSE) です。第三者ファイルや依存ライブラリは各自のライセンスに従います。MITの記載がそれらの条件を上書きすることはありません。

[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)、[PUBLICATION_CHECKLIST.md](PUBLICATION_CHECKLIST.md)、[VALIDATION.md](VALIDATION.md) を確認してください。r10版にはWordNet抽出データや新しいNLPライブラリは含まれていません。これらを追加する際は、出典・変更内容・必要な著作権/ライセンス表示を追加して再検査します。
