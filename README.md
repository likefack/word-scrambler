# 表現スクランブラ

日本語・英語の文章を、元の文体をなるべく保ちながら部分的に言い換える実験用Webアプリです。

- 公開サイト: https://kotoba-style-rewriter.regal-raven-5622.chatgpt.site
- ソースコード: https://github.com/likefack/word-scrambler
- 作成者: 自我巨大児
- Copyright (c) 2026 codeswitcher
- このソースの機能版: 2026.10.18-r25

## 機能

- Groq APIを利用した1回の文体判定・置換候補生成。利用者自身のキーを実行時に渡します。
- 日本語・英語と3文体に対応する、ブラウザ内の機械的な辞書置換。
- 原文と変換後の比較、変更箇所、実際に変わった原文語数の割合、個別取り消し。
- スワイプ・タブ・左右矢印での前後表示切り替え。
- 件数・時間の診断情報と、成功した変換の原文・結果の任意送信。本文送信が選択されていると、変換1回の操作で送ります。別の手動問題報告も利用できます。
- 問い合わせフォームと、設定時だけ動くHMAC保護の問い合わせ転送用outbox。

意味・文法・文体の完全な保持や、任意の文章に対する一定の置換頻度は保証しません。表示する実置換率は原文語数のLCS差分であり、意味保持やウォーターマーク除去の成功率ではありません。ウォーターマーク撹乱に関する実験用途を含みますが、その効果は実証していません。

r25 では `before the meeting`・`after the meeting`・`before the deadline` の部分句置換を外し、節を含む文章で接続詞を壊す誤変換を避けます。

## 構成

TypeScript / React / Vinext / Cloudflare Workers / D1 / Drizzle / Groq API。Pythonの形態素解析器はこの本番ソースには組み込まれていません。単語の分割・計数には `Intl.Segmenter` を使います。

- `app/`: UI、ガイド、規約・プライバシー、公開POSTルート
- `lib/presets*.ts`: 辞書・文体判定・保守的な境界判定
- `lib/rewriter*.ts`: 原文一致、文法・意味属性の限定的な検査、編集適用
- `lib/server-model-format.ts`: 固定モデル `openai/gpt-oss-20b` へのJSON-object要求と厳格なローカル検証
- `lib/public-api-admission.ts`: D1で共有する匿名API受付上限
- `db/schema.ts` / `drizzle/`: スキーマと追記式の移行
- `tests/`: 合成文章・ダミーキー・模擬Groqを使うテスト

提供者キー方式は非表示で、公開変換ルートからの利用も拒否します。秘密を設定するだけでは有効になりません。再利用には別途の設計・安全確認が必要です。

## ローカル開発

Node.js 22.13.0以上、npm、ネイティブWorkerdが実行できるOSが必要です。

```sh
npm run setup:local
npm run install:ci
npm run dev -- --host 127.0.0.1
```

`http://127.0.0.1:5173` を開きます。`setup:local` は実サイトID・秘密なしの `config/hosting.local.example.json` から、無視対象の `.openai/hosting.json` を作ります。既存の設定を上書きしません。

ホームディレクトリへ書き込めない環境では、作業用ディレクトリを指定できます。

```sh
export npm_config_cache="$PWD/.sites-runtime/npm-cache"
export XDG_CONFIG_HOME="$PWD/.sites-runtime/xdg-config"
```

辞書処理はキー不要です。AIの実行は本文とキーをローカルサーバー経由でGroqへ送り、利用者のGroq契約の利用枠・料金に従います。一般APIはログイン不要ですが、サーバーAPIを使うにはD1の移行が必要です。ローカル開発サーバーを公衆インターネットへ公開しないでください。

### ローカルDB

ビルドしてから、同梱の移行を番号順にローカルDBへ適用します。次はPOSIXシェル用です。

```sh
npm run build
for migration in drizzle/*.sql; do
  node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file "$migration"
done
```

`--remote` を追加しないでください。既に適用済みの移行を重ねて実行せず、開発サーバーと同じ状態保存先を使ってください。移行がなければサーバーAPIは安全側で受付を拒否します。問い合わせ転送は秘密・運転フラグ・切替時刻が揃わない限り停止状態です。

### 検証

```sh
npm run test
npm run test:dictionaries
npm run typecheck
npm run build
npm run start
```

テストは直列で実行します。実Groqキーは使いません。現在の検証結果と範囲は [VALIDATION.md](VALIDATION.md)、境界・報告方法は [SECURITY.md](SECURITY.md) を参照してください。

## データと配備

- キーはブラウザの一時メモリから同一サイト中継を通してGroqへ送信します。アプリの永続ストレージに保存しません。
- 通常診断は件数・時間・固定分類のみ。初期ONですが保存済みOFFを維持し、OFFでも変換できます。
- 成功時の原文・結果の送信も未設定なら初期ONで、保存済みOFFを維持します。本文送信をOFFにしても変換できます。実行ボタンに送信状態を表示し、成功時だけ今回の原文・結果を送信します。初期ONは明示同意を取得した証拠とは扱いません。
- 手動の問題報告では、本文添付は初期OFFで、編集可能なプレビュー・専用同意・送信操作が必要です。自動診断と手動報告の表は別です。
- 問い合わせは別の自由文機能です。転送先をソースやブラウザへ埋め込まず、別途承認された秘密設定・受信側設定を必要とします。
- 公開読取APIはありません。サイトの運営者、基盤、ブラウザ拡張等を含めた完全な秘密保護を保証するものではありません。

別の環境へ配備する場合は、表示される運営者・規約・プライバシー説明・問い合わせの運用、アクセス設定、D1、秘密管理、濫用防止を自分の環境に合わせてください。実サイトの設定・DB・キーはこのソースに含まれません。

## ライセンス

自作部分は [MIT](LICENSE)。依存コード、テンプレート、画像内の第三者UIや商標にはそれぞれの条件が適用されます。[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) と [DEPENDENCY_LICENSES.json](DEPENDENCY_LICENSES.json) を確認してください。
