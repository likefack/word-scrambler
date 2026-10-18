'use client';

import { useId, useRef, useState } from 'react';
import { isErrorReportId, projectErrorReportDiagnostic, type ErrorReportDiagnostic } from '../lib/error-reports';

type ReportState = { identity: unknown; sending: boolean; reportId?: string; error?: string };

/** Network activity starts only in the click handler. No auto-send/retry/beacon. */
export function ErrorReportButton({ diagnostic }: { diagnostic: unknown }) {
  const descriptionId = useId();
  const [state, setState] = useState<ReportState>({ identity: diagnostic, sending: false });
  const busy = useRef(false);
  const pending = useRef<{ identity: unknown; payload: ErrorReportDiagnostic; reportId: string } | null>(null);
  const current = state.identity === diagnostic ? state : { identity: diagnostic, sending: false };

  async function sendReport() {
    if (busy.current || current.reportId) return;
    // Prepare a new, fully validated object. The source object is NEVER serialized.
    const payload = pending.current && pending.current.identity === diagnostic
      ? pending.current.payload
      : projectErrorReportDiagnostic(diagnostic);
    if (!payload) {
      setState({ identity: diagnostic, sending: false, error: '診断情報の形式や時刻を確認できないため送信できません。もう一度処理してからお試しください。' });
      return;
    }
    // This UUID identifies this report only; it is never used as a request trace.
    const reportId = pending.current && pending.current.identity === diagnostic ? pending.current.reportId : crypto.randomUUID();
    pending.current = { identity: diagnostic, payload, reportId };
    busy.current = true;
    setState({ identity: diagnostic, sending: true });
    try {
      const response = await fetch('/api/error-reports', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'manual',
        headers: { 'Content-Type': 'application/json', 'X-Report-Id': reportId }, body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        const message = response.status === 401 ? '接続を確認できません。ページを開き直してから送信してください。'
          : response.status === 429 ? '送信が続いているため、少し待ってからもう一度お試しください。'
          : response.status === 400 || response.status === 413 ? '診断情報を受け付けられませんでした。もう一度処理してからお試しください。'
          : response.status === 403 ? 'このサイトのページを開き直してから送信してください。'
          : 'レポートを保存できませんでした。時間を空けてもう一度お試しください。';
        setState({ identity: diagnostic, sending: false, error: message });
        return;
      }
      const receipt: unknown = await response.json();
      const receiptReportId = receipt && typeof receipt === 'object' ? (receipt as Record<string, unknown>).reportId : undefined;
      if (!isErrorReportId(receiptReportId)) throw new Error('INVALID_RECEIPT');
      setState({ identity: diagnostic, sending: false, reportId: receiptReportId });
    } catch {
      setState({ identity: diagnostic, sending: false, error: '送信結果を確認できませんでした。再度送っても同じ診断は重複保存されません。' });
    } finally {
      busy.current = false;
    }
  }

  return <div className="error-report-controls">
    <p id={descriptionId}>ボタンを押すと、診断コード・処理段階・ステータス・版・ID・時刻のみを、このサイトのサーバーに保存します。入力文・APIキー・エラー本文・メールアドレスは送信内容に含めません。後から原因調査に使います。最大1,000件を保持し、30日を過ぎた記録は次回送信時に削除します。</p>
    <button type="button" onClick={sendReport} disabled={current.sending || Boolean(current.reportId)} aria-describedby={descriptionId}>
      {current.sending ? '送信中…' : current.reportId ? 'レポート送信済み' : 'エラーレポートを送信'}
    </button>
    {current.reportId && <p role="status">保存しました。レポートID：{current.reportId}</p>}
    {current.error && <p role="alert">{current.error}</p>}
  </div>;
}
