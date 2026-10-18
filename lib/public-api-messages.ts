/** Browser-safe fixed copy. Never display arbitrary admission/DB error strings. */
export function publicApiErrorMessage(code: unknown): string | null {
  switch (code) {
    case 'PUBLIC_RATE_LIMIT': return 'サイト全体のAI利用が混み合っています。少し待ってからお試しください。';
    case 'PUBLIC_ADMISSION_UNAVAILABLE': return '安全な利用上限を確認できませんでした。時間を置いてお試しください。';
    case 'AUTH_REQUIRED': return '接続を確認できません。ページを開き直してください。';
    default: return null;
  }
}
