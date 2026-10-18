import type { Metadata } from 'next';
import { ContactForm } from './contact-form';
import './contact.css';

export const metadata: Metadata = {
  title: 'お問い合わせ | 表現スクランブラ',
  description: '表現スクランブラの不具合やご意見を送信する問い合わせフォーム。',
};
export const dynamic = 'force-dynamic';
export default async function ContactPage() {
  return <main className="contact-page">
    <nav aria-label="サイト内ナビゲーション"><a href="/">← 表現スクランブラへ戻る</a></nav>
    <header><h1>お問い合わせ</h1><p>不具合のご報告やご意見をお送りください。</p></header>
    <aside className="contact-notice"><strong>秘密情報や他人の個人情報を入力しないでください。</strong>
      <p>APIキー、パスワード、決済情報、機密文書、病歴などの要配慮情報は送信できません。不具合の報告には、再現手順や診断コードを使い、APIキーは記入しないでください。変換内容の問題は、ツールの結果欄にある「問題を報告する」から、必要な部分だけを任意で添付できます。</p>
    </aside>
    <ContactForm />
    <section className="contact-handling" aria-labelledby="contact-handling-title">
      <h2 id="contact-handling-title">送信後の取り扱い</h2>
      <p>内容はサイトの非公開データベースに保存され、Google Apps Scriptなどの定期的な転送処理により運営者のGmailへ転送されます。運営者はOpenAIのAIアシスタントも利用して内容を取得・確認し、対応します。メールアドレスを入力して返信を希望した場合は、お問い合わせへの返信にも利用します。一般公開はしません。</p>
      <p>サイト内では受付後30日以内を通常の参照対象とし、期限を過ぎた内容は次回受付などの清掃時に削除します。保存件数の上限は1,000件で、上限に達した場合は古いものから削除します。期限到来と同時の完全消去は保証しません。転送後のメールの取り扱いはプライバシー説明をご確認ください。</p>
      <p>この画面で確認できるのは保存の受付です。即時のメール転送、返信、返信時期は保証していません。返信は運営者が必要に応じて手動で行います。自動受付メールは送信しません。</p>
    </section>
    <footer><span>© 2026 codeswitcher · 作成者：自我巨大児</span><a href="/privacy">プライバシー説明</a><a href="/terms">利用規約</a><a href="/">ツールへ戻る</a><a href="https://github.com/likefack/word-scrambler" target="_blank" rel="noopener noreferrer">ソースコード（GitHub）</a></footer>
  </main>;
}
