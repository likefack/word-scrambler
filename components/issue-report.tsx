'use client';
import { useEffect, useRef, useState } from 'react';
import { ISSUE_CATEGORIES, ISSUE_CONSENT_VERSION, DIAGNOSTIC_TEXT_CONSENT_VERSION, ISSUE_TEXT_LIMIT, issueErrorMessage, validateIssueReport, type IssueCategory } from '../lib/issue-reports';
import { isConversionId } from '../lib/conversion-diagnostics';

type Props = {purpose?:'issue'|'diagnostic';initialCategory?:IssueCategory;conversionId:string;version:string;mode:'preset'|'ai';language:'ja'|'en';original:string;rewritten:string;containsCurrentKey:(text:string)=>boolean};
export function IssueReportForm(props:Props) {
  const [includeText,setIncludeText]=useState(props.purpose==='diagnostic');
  const [original,setOriginal]=useState(props.purpose==='diagnostic'?props.original:'');
  const [rewritten,setRewritten]=useState(props.purpose==='diagnostic'?props.rewritten:'');
  const [category,setCategory]=useState<IssueCategory>(props.purpose==='diagnostic'?'other':props.initialCategory??'grammar');
  const [consent,setConsent]=useState(false);
  const [sending,setSending]=useState(false);
  const [message,setMessage]=useState('');
  const [receipt,setReceipt]=useState('');
  const reportId=useRef('');
  const inFlight=useRef(false);
  const controller=useRef<AbortController|null>(null);
  const originalRef=useRef<HTMLTextAreaElement>(null);
  const rewrittenRef=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{
    const clear=()=>{controller.current?.abort();if(originalRef.current)originalRef.current.value='';if(rewrittenRef.current)rewrittenRef.current.value='';setOriginal('');setRewritten('');setIncludeText(false);setConsent(false);};
    const restored=(event:PageTransitionEvent)=>{if(event.persisted)clear();};
    window.addEventListener('pagehide',clear);window.addEventListener('pageshow',restored);
    return()=>{window.removeEventListener('pagehide',clear);window.removeEventListener('pageshow',restored);clear();};
  },[]);
  function edited(){setConsent(false);setMessage('');reportId.current='';}
  async function submit(){
    if(inFlight.current||receipt)return;
    setMessage('');
    // The key is checked locally by a predicate; it is never a report field.
    if(includeText&&(props.containsCurrentKey(original)||props.containsCurrentKey(rewritten))){setMessage(issueErrorMessage('ISSUE_SECRET_BLOCKED'));setConsent(false);return;}
    if(!reportId.current)reportId.current=crypto.randomUUID();
    const validation=validateIssueReport({...(props.purpose==='diagnostic'?{diagnosticsEnabled:true}:{}),reportId:reportId.current,conversionId:props.conversionId,version:props.version,mode:props.mode,language:props.language,category,includeText,original:includeText?original:null,rewritten:includeText?rewritten:null,consent,consentVersion:props.purpose==='diagnostic'?DIAGNOSTIC_TEXT_CONSENT_VERSION:ISSUE_CONSENT_VERSION});
    if(!validation.ok){setMessage(issueErrorMessage(validation.code));return;}
    inFlight.current=true;setSending(true);const abort=new AbortController();controller.current=abort;const timer=setTimeout(()=>abort.abort(),15000);
    try {
      const response=await fetch('/api/issue-reports',{method:'POST',credentials:'same-origin',redirect:'error',cache:'no-store',headers:{'Content-Type':'application/json'},signal:abort.signal,body:JSON.stringify(validation.value)});
      const raw:unknown=await response.json();const data=raw&&typeof raw==='object'?raw as Record<string,unknown>:{};
      if(!response.ok){setMessage(issueErrorMessage(data.code));return;}
      if(response.status!==201||!isConversionId(data.reportId)||data.reportId!==reportId.current)throw new Error('invalid receipt');
      setReceipt(data.reportId);setOriginal('');setRewritten('');setIncludeText(false);setConsent(false);
    }catch{if(!abort.signal.aborted||document.visibilityState!=='hidden')setMessage(issueErrorMessage('ISSUE_UNAVAILABLE'));}
    finally{clearTimeout(timer);inFlight.current=false;setSending(false);}
  }
  return <details className="issue-report"><summary>{props.purpose==='diagnostic'?'本文の送信内容を確認':'問題を報告する'}</summary>
    {receipt?<div role="status"><p>報告を受け付けました。</p><p>報告ID：<span className="issue-id">{receipt}</span></p></div>:<div aria-busy={sending}>
      <p>{props.purpose==='diagnostic'?'この実行の原文・変換結果を確認し、必要な部分だけ編集して送信できます。変換IDに紐付けます。':'変換IDと問題の種類を送信します。本文の添付は任意です。'}</p>
      {props.purpose!=='diagnostic'&&<label className="issue-field">問題の種類<select value={category} disabled={sending} onChange={event=>{setCategory(event.target.value as IssueCategory);edited();}}>{Object.entries(ISSUE_CATEGORIES).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>}
      {props.purpose!=='diagnostic'&&<label className="consent-check"><input type="checkbox" checked={includeText} disabled={sending} onChange={event=>{const enabled=event.target.checked;setIncludeText(enabled);setOriginal(enabled?props.original:'');setRewritten(enabled?props.rewritten:'');edited();}}/>原文・変換結果を添える（任意）</label>}
      {includeText&&<div className="issue-preview"><p>送信する文章です。必要な部分だけ残し、個人情報・機密・送信する権限のない文章を削除してください。APIキー、パスワード、支払・医療情報は送らないでください。秘密検出には見落としがあります。</p>
        <label className="issue-field">原文<textarea ref={originalRef} rows={5} maxLength={ISSUE_TEXT_LIMIT} value={original} disabled={sending} onChange={event=>{setOriginal(event.target.value);edited();}}/><small>{original.length} / 3,000文字</small></label>
        <label className="issue-field">変換結果<textarea ref={rewrittenRef} rows={5} maxLength={ISSUE_TEXT_LIMIT} value={rewritten} disabled={sending} onChange={event=>{setRewritten(event.target.value);edited();}}/><small>{rewritten.length} / 3,000文字</small></label>
      </div>}
      <label className="consent-check issue-consent"><input type="checkbox" checked={consent} disabled={sending} onChange={event=>setConsent(event.target.checked)}/><span>送信内容を確認し、個人情報・秘密情報・送信する権限のない文章を除きました。<a href="/privacy#text-reports" target="_blank" rel="noopener noreferrer">データの扱い</a>に基づき、サイトへの保存と、運営者およびOpenAIのAIアシスタントによる調査・分析に同意します。</span></label>
      <button type="button" className="issue-submit" disabled={!consent||sending} onClick={submit}>{sending?'送信中…':props.purpose==='diagnostic'?'確認した本文を診断に添える':includeText?'確認した内容を添付して報告する':'本文を添付せず報告する'}</button>
      <p>送信ボタンを押すまで送信しません。この報告はメール転送しません。</p>
      {message&&<p className="issue-error" role="alert">{message}</p>}
    </div>}
  </details>;
}
