import { containsContactSecret } from './contact-intake';
import { isConversionId } from './conversion-diagnostics';

/** A separate, explicit report. Never merge this with automatic diagnostics. */
export const ISSUE_CONSENT_VERSION = '2026-10-18.2';
export const DIAGNOSTIC_TEXT_CONSENT_VERSION = '2026-10-18.4';
export const ISSUE_TEXT_LIMIT = 3000;
export const ISSUE_BODY_LIMIT = 32768;
export const ISSUE_MAX_ROWS = 1000;
export const ISSUE_RETENTION_MS = 30 * 86400000;
export const ISSUE_CATEGORIES = {
  grammar: '文法・つながりが不自然', meaning: '意味が変わった',
  low_changes: '置き換えが少ない', other: 'その他の問題',
} as const;
export type IssueCategory = keyof typeof ISSUE_CATEGORIES;
export type IssueReport = {
  reportId: string; conversionId: string; version: string;
  mode: 'preset' | 'ai'; language: 'ja' | 'en'; category: IssueCategory;
  includeText: boolean; original: string | null; rewritten: string | null;
  diagnosticsEnabled?:true; consent: true; consentVersion: typeof ISSUE_CONSENT_VERSION | typeof DIAGNOSTIC_TEXT_CONSENT_VERSION;
};
const fields = ['reportId','conversionId','version','mode','language','category','includeText','original','rewritten','consent','consentVersion'];
export function validateIssueReport(input: unknown): {ok:true;value:IssueReport}|{ok:false;code:string} {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {ok:false,code:'ISSUE_INVALID'};
  const v = input as Record<string,unknown>;
  const expectedFields=v.consentVersion===DIAGNOSTIC_TEXT_CONSENT_VERSION?[...fields,'diagnosticsEnabled']:fields;
  if (Object.keys(v).length !== expectedFields.length || Object.keys(v).some(k=>!expectedFields.includes(k))) return {ok:false,code:'ISSUE_INVALID'};
  if (v.consent !== true || ![ISSUE_CONSENT_VERSION,DIAGNOSTIC_TEXT_CONSENT_VERSION].includes(v.consentVersion as typeof ISSUE_CONSENT_VERSION)) return {ok:false,code:'ISSUE_CONSENT_REQUIRED'};
  if(v.consentVersion===DIAGNOSTIC_TEXT_CONSENT_VERSION&&(v.diagnosticsEnabled!==true||v.includeText!==true||v.category!=='other'))return {ok:false,code:'ISSUE_INVALID'};
  if (!isConversionId(v.reportId) || !isConversionId(v.conversionId) || typeof v.version !== 'string' || !/^\d{4}\.\d{2}\.\d{2}-r\d{1,6}$/.test(v.version)) return {ok:false,code:'ISSUE_INVALID'};
  const date = new Date(v.version.slice(0,10).replaceAll('.','-')+'T00:00:00.000Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==v.version.slice(0,10).replaceAll('.','-')) return {ok:false,code:'ISSUE_INVALID'};
  if (!['preset','ai'].includes(v.mode as string) || !['ja','en'].includes(v.language as string) || typeof v.category !== 'string' || !Object.hasOwn(ISSUE_CATEGORIES,v.category) || typeof v.includeText !== 'boolean') return {ok:false,code:'ISSUE_INVALID'};
  if (!v.includeText && (v.original !== null || v.rewritten !== null)) return {ok:false,code:'ISSUE_INVALID'};
  if (v.includeText) {
    if (typeof v.original !== 'string' || typeof v.rewritten !== 'string' || v.original.length>ISSUE_TEXT_LIMIT || v.rewritten.length>ISSUE_TEXT_LIMIT || !(v.original.trim()||v.rewritten.trim())) return {ok:false,code:'ISSUE_TEXT_INVALID'};
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v.original+v.rewritten)) return {ok:false,code:'ISSUE_TEXT_INVALID'};
    if (containsContactSecret(v.original+'\n'+v.rewritten)) return {ok:false,code:'ISSUE_SECRET_BLOCKED'};
  }
  return {ok:true,value:{...(v.consentVersion===DIAGNOSTIC_TEXT_CONSENT_VERSION?{diagnosticsEnabled:true as const}:{}),reportId:v.reportId.toLowerCase(),conversionId:v.conversionId.toLowerCase(),version:v.version,mode:v.mode as IssueReport['mode'],language:v.language as IssueReport['language'],category:v.category as IssueCategory,includeText:v.includeText,original:v.includeText?v.original as string:null,rewritten:v.includeText?v.rewritten as string:null,consent:true,consentVersion:v.consentVersion as IssueReport['consentVersion']}};
}
export function issueErrorMessage(code: unknown): string {
  switch(code) {
    case 'PUBLIC_RATE_LIMIT': return 'サイト全体の利用が混み合っています。少し時間を空けてからお試しください。';
    case 'PUBLIC_ADMISSION_UNAVAILABLE': return '安全な利用上限を確認できませんでした。時間を置いてお試しください。';
    case 'AUTH_REQUIRED': return '接続を確認できません。ページを開き直してください。';
    case 'ISSUE_CONSENT_REQUIRED': return '送信内容とデータの扱いを確認し、専用の同意にチェックしてください。';
    case 'ISSUE_SECRET_BLOCKED': return 'APIキーや秘密情報が含まれる可能性があります。取り除いてから送信してください。';
    case 'ISSUE_TEXT_INVALID': return '添付する文章を各3,000文字以内にしてください。両方を空にする場合は本文添付をオフにしてください。';
    case 'ISSUE_BUSY': case 'ISSUE_RATE_LIMIT': return '報告が集中しています。時間を空けてからお試しください。';
    default: return '受付を確認できませんでした。送信済みの可能性もあるため、すぐに繰り返し送信しないでください。';
  }
}
