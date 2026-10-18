'use client';
import { useRef, useState } from 'react';
import {
  CONTACT_BODY_LIMIT, CONTACT_CONSENT_VERSION, CONTACT_EMAIL_LIMIT, CONTACT_SUBJECT_LIMIT,
  contactErrorMessage, isContactSubmissionId, validateContactInput,
} from '../../lib/contact-intake';

export function ContactForm() {
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [consent, setConsent] = useState(false);
  const [replyRequested, setReplyRequested] = useState(false);
  const [website, setWebsite] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [receipt, setReceipt] = useState('');
  const inFlight = useRef(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || receipt) return;
    setMessage('');
    const input = { email, subject, body, consent, consentVersion: CONTACT_CONSENT_VERSION, replyRequested, website };
    const validation = validateContactInput(input);
    if (!validation.ok) { setMessage(contactErrorMessage(validation.code)); return; }
    inFlight.current = true; setSending(true);
    try {
      const response = await fetch('/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', redirect: 'manual', cache: 'no-store',
        signal: AbortSignal.timeout(20_000), body: JSON.stringify(validation.value),
      });
      // The server returns only a small receipt or a fixed error code, never input.
      const result: unknown = await response.json();
      const data = result && typeof result === 'object' ? result as Record<string, unknown> : {};
      if (!response.ok) { setMessage(contactErrorMessage(data.code)); return; }
      if (response.status !== 201 || !isContactSubmissionId(data.submissionId)) throw new Error('Invalid receipt');
      setReceipt(data.submissionId);
      setEmail(''); setSubject(''); setBody(''); setConsent(false); setReplyRequested(false); setWebsite('');
    } catch {
      setMessage('受付結果を確認できませんでした。すでに保存されている可能性があります。入力は残しています。重複送信を避けるため、すぐに繰り返し送信しないでください。');
    } finally {
      inFlight.current = false; setSending(false);
    }
  }
  if (receipt) return <section className="contact-success" role="status" aria-live="polite">
    <h2>お問い合わせを受け付けました</h2>
    <p>サイトの非公開データベースへの保存を確認しました。</p>
    <p>受付番号：<span className="contact-receipt">{receipt}</span></p>
    <p>この表示はメール転送や返信の完了を示すものではありません。</p>
    <a href="/">ツールへ戻る</a>
    <button type="button" onClick={() => { setReceipt(''); setMessage(''); }}>別のお問い合わせを入力する</button>
  </section>;
  return <form className="contact-form" onSubmit={submit} aria-busy={sending}>
    <fieldset disabled={sending}>
      <legend className="contact-visually-hidden">お問い合わせ内容</legend>
      <label className="contact-field" htmlFor="contact-subject"><span>件名 <span className="contact-required">必須</span></span>
        <input id="contact-subject" name="subject" type="text" maxLength={CONTACT_SUBJECT_LIMIT} required value={subject} onChange={event => setSubject(event.target.value)} autoComplete="off" />
        <small>{subject.length} / {CONTACT_SUBJECT_LIMIT}文字</small>
      </label>
      <label className="contact-field" htmlFor="contact-body"><span>お問い合わせ内容 <span className="contact-required">必須</span></span>
        <textarea id="contact-body" name="body" maxLength={CONTACT_BODY_LIMIT} required rows={9} value={body} onChange={event => setBody(event.target.value)} aria-describedby="contact-body-help" />
        <small id="contact-body-help">{body.length} / {CONTACT_BODY_LIMIT.toLocaleString()}文字。APIキーや他人の個人情報は入力しないでください。</small>
      </label>
      <label className="contact-field" htmlFor="contact-email"><span>返信先メールアドレス <span className="contact-optional">任意</span></span>
        <input id="contact-email" name="email" type="email" maxLength={CONTACT_EMAIL_LIMIT} value={email} onChange={event => { setEmail(event.target.value); setReplyRequested(false); }} autoComplete="email" aria-describedby="contact-email-help" />
        <small id="contact-email-help">返信を希望する場合に、ご本人のメールアドレスを入力してください。未入力の場合は返信できません。</small>
      </label>
      {email.trim() && <label className="contact-check"><input type="checkbox" checked={replyRequested} onChange={event => setReplyRequested(event.target.checked)} required /><span>このメールアドレスは自分のもので、お問い合わせへの返信を希望します。</span></label>}
      <div className="contact-honeypot" aria-hidden="true"><label htmlFor="contact-website">Website</label><input id="contact-website" name="website" value={website} onChange={event => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" /></div>
      <label className="contact-check contact-main-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required /><span><a href="/privacy" target="_blank" rel="noopener noreferrer">プライバシーポリシー</a>と<a href="/terms" target="_blank" rel="noopener noreferrer">利用規約</a>を確認し、お問い合わせ内容と任意の返信先を、対応・返信のためにサイトの非公開データベースへ保存すること、OpenAIのアシスタントが取得・処理すること、および運営者のGmailへ転送することに同意します。</span></label>
      <button className="contact-submit" type="submit" disabled={!consent || !subject.trim() || !body.trim() || (Boolean(email.trim()) && !replyRequested)}>{sending ? '送信中…' : '同意して送信する'}</button>
      <p className="contact-form-note">送信ボタンを押すまで、内容はサーバーに送信されません。</p>
    </fieldset>
    {message && <p className="contact-error" role="alert">{message}</p>}
  </form>;
}
