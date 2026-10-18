/** Public validation contract. Never put operator addresses or credentials here. */
export const CONTACT_CONSENT_VERSION = '2026-10-18.1';
export const CONTACT_SUBJECT_LIMIT = 120;
export const CONTACT_BODY_LIMIT = 4_000;
export const CONTACT_EMAIL_LIMIT = 254;
export const CONTACT_REQUEST_BYTE_LIMIT = 24_576;
export const CONTACT_MAX_ROWS = 1_000;
export const CONTACT_RETENTION_MS = 30 * 24 * 60 * 60_000;
export const CONTACT_HOURLY_LIMIT = 100;

export type ContactInput = {
  email: string;
  subject: string;
  body: string;
  consent: true;
  consentVersion: typeof CONTACT_CONSENT_VERSION;
  replyRequested: boolean;
  website: '';
};
export type ContactValidation = { ok: true; value: ContactInput } | { ok: false; code: string };

const fields = new Set(['email', 'subject', 'body', 'consent', 'consentVersion', 'replyRequested', 'website']);
// Best-effort prevention, never a promise to detect every kind of secret.
const secretPatterns = [
  /(?:gsk_|sk-(?:proj-|svcacct-|ant-)?|gh[pousr]_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{8,}/i,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/,
  /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /(?:api[ _-]?key|access[ _-]?token|refresh[ _-]?token|client[ _-]?secret|password|passwd|パスワード|秘密鍵)\s*[=:：]\s*["']?\S{4,}/i,
  /\b(?:AIza[0-9A-Za-z_-]{30,}|SG\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,})/,
];
export function containsContactSecret(value: string): boolean {
  return secretPatterns.some(pattern => pattern.test(value));
}
export function isContactSubmissionId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}
export function validateContactInput(input: unknown): ContactValidation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, code: 'CONTACT_INVALID' };
  const record = input as Record<string, unknown>;
  if (Object.keys(record).length !== fields.size || Object.keys(record).some(key => !fields.has(key))) return { ok: false, code: 'CONTACT_INVALID' };
  if (record.consent !== true || record.consentVersion !== CONTACT_CONSENT_VERSION) return { ok: false, code: 'CONTACT_CONSENT_REQUIRED' };
  if (record.website !== '' || typeof record.replyRequested !== 'boolean' || typeof record.email !== 'string' || typeof record.subject !== 'string' || typeof record.body !== 'string') return { ok: false, code: 'CONTACT_INVALID' };
  const email = record.email.trim();
  const subject = record.subject.trim();
  const body = record.body.trim();
  if (record.email.length > CONTACT_EMAIL_LIMIT || record.subject.length > CONTACT_SUBJECT_LIMIT || record.body.length > CONTACT_BODY_LIMIT || !subject || !body) return { ok: false, code: 'CONTACT_INVALID' };
  if (/[\u0000-\u001f\u007f]/.test(subject + email) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) return { ok: false, code: 'CONTACT_INVALID' };
  if (email && (!/^[A-Z0-9.!#$%&'*+\/=?^_`{|}~-]{1,64}@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(email) || email.startsWith('.') || email.includes('..') || email.split('@')[0].endsWith('.'))) return { ok: false, code: 'CONTACT_EMAIL_INVALID' };
  if (Boolean(email) !== record.replyRequested) return { ok: false, code: 'CONTACT_REPLY_CONSENT_REQUIRED' };
  if (containsContactSecret(`${email}\n${subject}\n${body}`)) return { ok: false, code: 'CONTACT_SECRET_BLOCKED' };
  return { ok: true, value: { email, subject, body, consent: true, consentVersion: CONTACT_CONSENT_VERSION, replyRequested: record.replyRequested, website: '' } };
}

/** Only needed if an authorized private consumer later renders a message as HTML.
 * Store original plain text; prefer plain-text email. Never execute message text.
 */
export function escapeContactHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}
export function contactErrorMessage(code: unknown): string {
  switch (code) {
    case 'PUBLIC_RATE_LIMIT': return 'サイト全体の利用が混み合っています。少し時間を空けてからお試しください。';
    case 'PUBLIC_ADMISSION_UNAVAILABLE': return '安全な利用上限を確認できませんでした。時間を置いてお試しください。';
    case 'AUTH_REQUIRED': return '接続を確認できません。ページを開き直してください。';
    case 'ORIGIN_MISMATCH': return 'このサイトの問い合わせ画面から送信してください。';
    case 'CONTACT_CONSENT_REQUIRED': return '保存・運営者への転送について確認し、同意してください。';
    case 'CONTACT_REPLY_CONSENT_REQUIRED': return '返信先を入力する場合は、ご本人のアドレスであることと返信への同意を確認してください。';
    case 'CONTACT_EMAIL_INVALID': return '返信先メールアドレスの形式を確認してください。';
    case 'CONTACT_SECRET_BLOCKED': return 'APIキーやパスワードなどの秘密情報が含まれる可能性があります。取り除いてから送信してください。';
    case 'CONTACT_TOO_LARGE': return '送信内容が大きすぎます。件名や本文を短くしてください。';
    case 'CONTACT_RATE_LIMIT': case 'CONTACT_BUSY': return '送信が集中しています。少し時間を空けてからお試しください。';
    case 'CONTACT_TIMEOUT': return '送信内容の読み取りがタイムアウトしました。通信状況を確認してください。';
    case 'CONTACT_INVALID': return '件名・本文・返信先・文字数を確認してください。';
    default: return '保存を確認できませんでした。入力は残しています。時間を空けてからお試しください。';
  }
}
