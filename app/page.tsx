'use client';
import {useEffect, useRef, useState} from 'react';
import {publicApiErrorMessage} from '../lib/public-api-messages';
import {resultSwipe, isVerticalGesture, type SwipeStart} from '../lib/result-swipe';
import { IssueReportForm } from '../components/issue-report';
import { ErrorReportButton } from '../components/error-report-button';
import { DIAGNOSTIC_CONSENT_VERSION, isConversionId } from '../lib/conversion-diagnostics';
import { DIAGNOSTIC_PREFERENCE_KEY, TEXT_DIAGNOSTIC_PREFERENCE_KEY, readDiagnosticPreference, saveDiagnosticPreference, readTextDiagnosticPreference, saveTextDiagnosticPreference } from '../lib/diagnostic-preference';
import { sendPresetDiagnostics, type ConversionStorage } from '../lib/client-conversion-diagnostics';
import { AUTOMATIC_TEXT_NOTICE_VERSION } from '../lib/automatic-text-diagnostics';
import { sendAutomaticTextDiagnostic, type AutomaticTextStorage } from '../lib/client-automatic-text-diagnostics';
import { OWNER_KEY_MODE_ENABLED } from '../lib/features';
import {ArrowRight, Check, ChevronDown, Copy, LockKeyhole, RotateCcw, X, Info, ArrowUpRight, BookOpen, LoaderCircle, ShieldCheck} from 'lucide-react';
import {classifyStyle, presetRewrite, STYLE_DICTIONARIES, type StyleId} from '../lib/presets';
import {changedWordCount, detectLanguage, MAX_CHARS, REJECTION_LABELS, words, type InputLanguage, type RewriteResult} from '../lib/rewriter';
const samples = {
  ja:[
    {label:'ビジネス',text:'いつもお世話になっております。\n先日ご相談した企画について、資料をまとめましたのでお送りいたします。今回の提案では、利用者の負担を減らし、より快適にサービスをご利用いただける仕組みを検討しております。\nお忙しいところ恐縮ですが、内容をご確認いただき、ご意見をいただけますと幸いです。'},
    {label:'日常の文章',text:'今日は少し早起きして、近所の公園を散歩した。\n朝の空気はひんやりしていて、歩いているうちに頭がすっきりしてきた。帰り道に小さなパン屋を見つけたので、焼きたてのパンを買って帰った。\n特別なことは何もなかったけれど、こんな穏やかな朝もいいなと思った。'},
    {label:'説明文',text:'植物が元気に育つためには、日光と水が欠かせません。\nただし、必要な水の量は植物の種類や季節によって異なります。土の表面が乾いているかを確認してから、水を与えることが大切です。\n毎日決まった量を与えるのではなく、植物の状態を観察しながら調整しましょう。'}
  ],
  en:[
    {label:'Business',text:'Thank you for your continued support.\nI have prepared the materials for the project we discussed and would appreciate your feedback. This proposal focuses on reducing the effort required from users and making the service more convenient.\nPlease review the document when you have a moment and let me know if you have any questions.'},
    {label:'Everyday',text:'I woke up a little earlier today and went for a walk in the nearby park.\nThe morning air was cool, and my mind felt clearer as I walked. On my way home, I found a small bakery and picked up some freshly baked bread.\nNothing special happened, but it was the kind of quiet morning I really enjoy.'},
    {label:'Explanatory',text:'Plants need sunlight and water to grow well.\nHowever, the amount of water they require depends on the type of plant and the season. It is important to check whether the surface of the soil is dry before watering.\nRather than providing the same amount every day, observe the plant and adjust your routine accordingly.'}
  ]
};
type Diagnostic = {code:string;requestId:string;version:string;stage:string;httpStatus:number;upstreamStatus?:number;timestamp:string};
const APP_VERSION='2026.10.18-r32';
function safeDiagnostic(raw:unknown,status:number,code:string,stage:string):Diagnostic {
  const data=raw&&typeof raw==='object'?raw as Record<string,unknown>:{};
  const safe=(value:unknown,pattern:RegExp,fallback:string)=>typeof value==='string'&&pattern.test(value)?value:fallback;
  return {code:safe(data.code,/^[A-Z][A-Z0-9_]{0,63}$/,code),requestId:safe(data.requestId,/^[0-9a-f-]{36}$/i,'unavailable'),version:safe(data.version,/^[0-9]{4}\.[0-9]{2}\.[0-9]{2}-r[0-9]+$/,APP_VERSION),stage:safe(data.stage,/^(authentication|origin|request_body|input_validation|key_selection|admission|provider_fetch|provider_status|provider_body|provider_content|output_validation|complete|client_request|client_response|client_network|client_timeout)$/,stage),httpStatus:Number.isInteger(data.httpStatus)&&Number(data.httpStatus)>=100&&Number(data.httpStatus)<=599?Number(data.httpStatus):status,...(Number.isInteger(data.upstreamStatus)&&Number(data.upstreamStatus)>=100&&Number(data.upstreamStatus)<=599?{upstreamStatus:Number(data.upstreamStatus)}:{}),timestamp:safe(data.timestamp,/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$/,new Date().toISOString())};
}
function validResult(value:unknown,source:string):value is RewriteResult {
  if(!value||typeof value!=='object')return false;
  const r=value as RewriteResult;
  if(r.original!==source||typeof r.rewritten!=='string'||!r.style||typeof r.style.label!=='string'||typeof r.style.explanation!=='string'||!Array.isArray(r.style.features)||!r.style.features.every(x=>typeof x==='string')||!Array.isArray(r.notes)||!r.notes.every(x=>typeof x==='string')||!Array.isArray(r.edits)||r.edits.length>512||!Number.isInteger(r.totalWords)||r.totalWords<1||!Number.isInteger(r.changedWords)||r.changedWords<0||r.changedWords>r.totalWords||!Number.isFinite(r.ratio)||r.ratio<0||r.ratio>100)return false;
  let cursor=0,rebuilt='';
  for(const e of r.edits){if(!e||typeof e.original!=='string'||typeof e.replacement!=='string'||!Number.isInteger(e.start)||!Number.isInteger(e.end)||e.start<cursor||e.end<=e.start||e.end>source.length||source.slice(e.start,e.end)!==e.original||!Number.isInteger(e.occurrence)||e.occurrence<0||!Number.isInteger(e.changedWords)||e.changedWords<0)return false;rebuilt+=source.slice(cursor,e.start)+e.replacement;cursor=e.end;}
  if(r.selection){const q=r.selection;if(![q.proposed,q.accepted,q.alignedUnique,q.protectedTerms].every(v=>Number.isInteger(v)&&v>=0&&v<=512)||q.accepted!==r.edits.length||!q.rejected||typeof q.rejected!=='object'||Array.isArray(q.rejected)||Object.entries(q.rejected).some(([k,v])=>!(k in REJECTION_LABELS)||!Number.isInteger(v)||v<0||v>512))return false;}
  return rebuilt+source.slice(cursor)===r.rewritten;
}
function Highlighted({result, original=false}:{result:RewriteResult;original?:boolean}){
  const parts:React.ReactNode[]=[];let cursor=0;
  for(const edit of result.edits){parts.push(result.original.slice(cursor,edit.start));parts.push(<mark className={original?'removed':'added'} key={edit.start} title={original?`変更後：${edit.replacement}`:`変更前：${edit.original}`}>{original?edit.original:edit.replacement}</mark>);cursor=edit.end;}
  parts.push(result.original.slice(cursor));return <>{parts}</>;
}
export default function Home(){
  const [text,setText]=useState(''); const [language,setLanguage]=useState<InputLanguage>('auto');
  const [sampleLanguage,setSampleLanguage]=useState<'ja'|'en'>('ja');
  const [mode,setMode]=useState<'preset'|'owner'|'ai'>('ai'); const [ownerAvailable,setOwnerAvailable]=useState<boolean|null>(null); const [ownerConsent,setOwnerConsent]=useState(false); const [apiKey,setApiKey]=useState(''); const [keyConsent,setKeyConsent]=useState(true); const [presetStyle,setPresetStyle]=useState<StyleId|'auto'>('auto'); const [resultMode,setResultMode]=useState<'preset'|'owner'|'ai'>('preset');
  const [resultPresetDescription,setResultPresetDescription]=useState(''); const [result,setResult]=useState<RewriteResult|null>(null); const [busy,setBusy]=useState(false); const [stage,setStage]=useState(0);
  const [error,setErrorState]=useState(''); const [errorRevision,setErrorRevision]=useState(0); const [diagnostic,setDiagnostic]=useState<Diagnostic|null>(null); const [diagnosticCopied,setDiagnosticCopied]=useState(false); const [copied,setCopied]=useState(false); const [showChanges,setShowChanges]=useState(true); const [showOriginal,setShowOriginal]=useState(false);
  const [diagnosticConsent,setDiagnosticConsent]=useState(true);
  const [diagnosticTextRequested,setDiagnosticTextRequested]=useState(true);
  const [diagnosticPreferenceReady,setDiagnosticPreferenceReady]=useState(false);
  const [diagnosticPreferenceWarning,setDiagnosticPreferenceWarning]=useState(false);
  const [conversion,setConversion]=useState<{id:string;storage:ConversionStorage}|null>(null);
  const [conversionCopied,setConversionCopied]=useState(false);
  const [execution,setExecution]=useState<{original:string;mode:'preset'|'ai';language:'ja'|'en';attachTextRequested:boolean}|null>(null);
  const [textStorage,setTextStorage]=useState<AutomaticTextStorage|null>(null);
  const automaticTextRunRef=useRef<{controller:AbortController;attempted:boolean;settled:boolean}|null>(null);
  function cancelAutomaticText(){const run=automaticTextRunRef.current;automaticTextRunRef.current=null;run?.controller.abort();if(run?.attempted&&!run.settled)setTextStorage('unavailable');}
  function sendExecutionText(run:{controller:AbortController;attempted:boolean;settled:boolean}|null,converted:RewriteResult,id:string,executionMode:'preset'|'ai',executionLanguage:'ja'|'en',original:string,key:string){
    if(!run||automaticTextRunRef.current!==run||run.controller.signal.aborted||run.attempted)return;
    run.attempted=true;
    if(key&&(original.includes(key)||converted.rewritten.includes(key))){run.settled=true;setTextStorage('blocked');return;}
    setTextStorage('sending');
    const timer=setTimeout(()=>run.controller.abort(),15000);
    void sendAutomaticTextDiagnostic({reportId:crypto.randomUUID(),conversionId:id,version:APP_VERSION,mode:executionMode,language:executionLanguage,original,rewritten:converted.rewritten,diagnosticsEnabled:true,selectionOnAtExecution:true,noticeVersion:AUTOMATIC_TEXT_NOTICE_VERSION},run.controller.signal)
      .then(status=>{run.settled=true;if(automaticTextRunRef.current===run)setTextStorage(status==='cancelled'?'unavailable':status);}).finally(()=>clearTimeout(timer));
  }
  const metricsAbortRef=useRef<AbortController|null>(null);
  const swipeStartRef=useRef<SwipeStart|null>(null);
  const abortRef=useRef<AbortController|null>(null); const apiKeyRef=useRef<HTMLInputElement>(null); const outputRef=useRef<HTMLElement>(null); const textareaRef=useRef<HTMLTextAreaElement>(null); const errorRef=useRef<HTMLDivElement>(null);
  const wordCount=words(text).length; const actualLanguage=text.trim()?detectLanguage(text):null;
  function setError(message:string){setErrorState(message);if(message)setErrorRevision(v=>v+1);}
  useEffect(()=>{if(!error)return;errorRef.current?.scrollIntoView({behavior:typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});},[error,errorRevision]);
  useEffect(()=>{
    if(typeof window==='undefined')return()=>abortRef.current?.abort();
    // Clear both React state and the DOM before a browser history snapshot can
    // retain the credential. Restore is a second guard for back/forward cache.
    const clearKey=()=>{cancelAutomaticText();abortRef.current?.abort('page-hidden');metricsAbortRef.current?.abort();if(apiKeyRef.current)apiKeyRef.current.value='';setApiKey('');setKeyConsent(false);setDiagnosticTextRequested(false);setExecution(previous=>previous?{...previous,attachTextRequested:false}:null);};
    const restored=(event:PageTransitionEvent)=>{if(event.persisted)clearKey();};
    window.addEventListener('pagehide',clearKey);window.addEventListener('pageshow',restored);
    return()=>{window.removeEventListener('pagehide',clearKey);window.removeEventListener('pageshow',restored);clearKey();};
  },[]);
  useEffect(()=>{if(!OWNER_KEY_MODE_ENABLED)return;const controller=new AbortController();fetch('/api/status',{signal:controller.signal,cache:'no-store'}).then(r=>r.ok?r.json() as Promise<{ownerKeyAvailable?:boolean}>:null).then(data=>setOwnerAvailable(data?.ownerKeyAvailable===true)).catch(()=>{if(!controller.signal.aborted)setOwnerAvailable(false);});return()=>controller.abort();},[]);
  useEffect(()=>{
    if(typeof window==='undefined')return;
    const restorePreference=()=>{const saved=readDiagnosticPreference(()=>window.localStorage),body=readTextDiagnosticPreference(()=>window.localStorage);setDiagnosticConsent(saved.enabled);setDiagnosticTextRequested(saved.enabled&&body.enabled);if(!saved.enabled||!body.enabled){cancelAutomaticText();setExecution(previous=>previous?{...previous,attachTextRequested:false}:null);}setDiagnosticPreferenceWarning(saved.status!=='ready'||body.status!=='ready');setDiagnosticPreferenceReady(true);};
    const changed=(event:StorageEvent)=>{if(event.key===null||event.key===DIAGNOSTIC_PREFERENCE_KEY||event.key===TEXT_DIAGNOSTIC_PREFERENCE_KEY)restorePreference();};
    const restored=(event:PageTransitionEvent)=>{if(event.persisted)restorePreference();};
    restorePreference();window.addEventListener('storage',changed);window.addEventListener('pageshow',restored);
    return()=>{window.removeEventListener('storage',changed);window.removeEventListener('pageshow',restored);};
  },[]);
  function chooseTextPreference(enabled:boolean){setDiagnosticTextRequested(enabled);if(!enabled){cancelAutomaticText();setExecution(previous=>previous?{...previous,attachTextRequested:false}:null);}setDiagnosticPreferenceWarning(!saveTextDiagnosticPreference(()=>window.localStorage,enabled));}
  function chooseDiagnosticPreference(enabled:boolean){setDiagnosticConsent(enabled);let bodySaved=true;if(!enabled){cancelAutomaticText();setDiagnosticTextRequested(false);setExecution(previous=>previous?{...previous,attachTextRequested:false}:null);bodySaved=saveTextDiagnosticPreference(()=>window.localStorage,false);}setDiagnosticPreferenceWarning(!saveDiagnosticPreference(()=>window.localStorage,enabled)||!bodySaved);}
  const classification=classifyStyle(text,language);
  const dictionaryLanguage=language==='auto'?(actualLanguage??sampleLanguage):language;
  const dictionaryStyle=presetStyle==='auto'?classification.id:presetStyle;
  const dictionaryCount=STYLE_DICTIONARIES[dictionaryLanguage][dictionaryStyle].length;
  useEffect(()=>{if(!busy)return;const t=setInterval(()=>setStage(v=>Math.min(v+1,2)),6000);return()=>clearInterval(t);},[busy]);
  function updateText(value:string){cancelAutomaticText();setTextStorage(null);setExecution(null);setConversion(null);setConversionCopied(false);setText(value);setError('');setDiagnostic(null);setResult(null);setCopied(false);setShowOriginal(false);}
  function loadSample(value:string){if(text && !window.confirm('現在の入力をサンプルで上書きしますか？'))return;updateText(value);textareaRef.current?.focus();}
  async function rewrite(){
    if(busy||!diagnosticPreferenceReady)return;cancelAutomaticText();setTextStorage(null);setResult(null);setDiagnostic(null);setDiagnosticCopied(false);
    setExecution({original:text,attachTextRequested:diagnosticConsent&&diagnosticTextRequested,mode:mode==='preset'?'preset':'ai',language:language==='auto'?detectLanguage(text):language});
    const conversionId=crypto.randomUUID(),started=Date.now();metricsAbortRef.current?.abort();setConversion({id:conversionId,storage:'off'});setConversionCopied(false);
    if(!text.trim()){setError('入力テキストが空です。');textareaRef.current?.focus();return;}
    if(wordCount<4){setError('入力には4語以上が必要です。');return;}
    if(text.length>MAX_CHARS){setError('文章は3,000文字以内で入力してください。');return;}
    const textRun=diagnosticConsent&&diagnosticTextRequested?{controller:new AbortController(),attempted:false,settled:false}:null;automaticTextRunRef.current=textRun;
    if(mode==='preset'){try{const converted=presetRewrite(text,language,presetStyle);setResult(converted);
      if(diagnosticConsent){
        const metricsController=new AbortController();metricsAbortRef.current=metricsController;setConversion({id:conversionId,storage:'sending'});
        const elapsedMs=Math.min(180000,Math.max(0,Date.now()-started));const timer=setTimeout(()=>metricsController.abort(),8000);
        void sendPresetDiagnostics({conversionId,version:APP_VERSION,consentVersion:DIAGNOSTIC_CONSENT_VERSION,mode:'preset',providerCategory:'none',language:dictionaryLanguage,style:dictionaryStyle,totalWords:converted.totalWords,proposed:converted.selection?.proposed??converted.edits.length,applied:converted.edits.length,changedWords:converted.changedWords,rejected:converted.selection?.rejected??{},elapsedMs,providerMs:0,validationMs:elapsedMs,status:'ok',stage:'complete'},metricsController.signal).then(storage=>setConversion(previous=>previous?.id===conversionId?{id:conversionId,storage}:previous)).finally(()=>clearTimeout(timer));
      }
      sendExecutionText(textRun,converted,conversionId,'preset',dictionaryLanguage,text,apiKey.trim());
      setResultPresetDescription(`${dictionaryLanguage==='ja'?'日本語':'英語'} / ${converted.style.label} / ${presetStyle==='auto'?'自動分類':'手動選択'}`);setResultMode('preset');setError('');setCopied(false);setShowOriginal(false);setTimeout(()=>outputRef.current?.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}),100);}catch(e){setError(e instanceof Error?e.message:'変換できませんでした。');}return;}
    if(mode==='owner'&&(!OWNER_KEY_MODE_ENABLED||!ownerAvailable)){setError('提供者キーは未設定、または利用状態を確認できません。');return;}
    if(mode==='ai'&&!apiKey.trim()){setError('ご自身のGroq APIキーを入力してください。');return;}
    if(mode==='owner'?!ownerConsent:!keyConsent){setError('Groqへの送信と利用条件の確認が必要です。');return;}
    const controller=new AbortController();abortRef.current=controller;setStage(0);setBusy(true);setError('');setResult(null);setCopied(false);setShowOriginal(false);
    const timeout=setTimeout(()=>controller.abort('timeout'),75000);
    try{
      const r=await fetch('/api/rewrite',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,language,keySource:mode==='owner'?'owner':'byok',...(mode==='ai'?{apiKey}:{}),...(diagnosticConsent?{diagnosticsConsent:true,diagnosticsConsentVersion:DIAGNOSTIC_CONSENT_VERSION}:{})}),signal:controller.signal});
      let data:RewriteResult & {error?:string;code?:string;diagnostic?:unknown;conversion?:{id?:unknown;storage?:unknown}};
      try{data=await r.json() as typeof data;}catch{const responseId=isConversionId(r.headers.get('X-Request-Id'))?r.headers.get('X-Request-Id')!:conversionId;setConversion({id:responseId,storage:diagnosticConsent?'unavailable':'off'});setDiagnostic(safeDiagnostic({requestId:responseId},r.status,'CLIENT_NON_JSON','client_response'));setError('サーバーの応答をJSONとして読み取れませんでした。ページを開き直すか、時間を空けてお試しください。');return;}
      if(data?.conversion&&isConversionId(data.conversion.id)){const storage=data.conversion.storage;setConversion({id:data.conversion.id,storage:storage==='stored'||storage==='off'||storage==='rate_limited'?storage:'unavailable'});}
      else if(diagnosticConsent)setConversion({id:conversionId,storage:'unavailable'});
      if(!r.ok){setDiagnostic(safeDiagnostic(data?.diagnostic,r.status,'HTTP_'+r.status,'client_response'));setError(publicApiErrorMessage(data?.code) ?? (typeof data?.error==='string'&&(!apiKey.trim()||!data.error.includes(apiKey.trim()))?data.error.slice(0,400):'処理に失敗しました。診断情報を確認してください。'));return;}
      if(apiKey.trim()&&JSON.stringify(data).includes(apiKey.trim())){setDiagnostic(safeDiagnostic(null,r.status,'SENSITIVE_OUTPUT_BLOCKED','client_response'));setError('応答に機密情報が含まれる可能性があるため、表示を中止しました。');return;}
      if(!validResult(data,text)){setDiagnostic(safeDiagnostic(null,r.status,'CLIENT_INVALID_RESULT','client_response'));setError('サーバーの応答が結果の形式に適合しませんでした。');return;}
      sendExecutionText(textRun,data,isConversionId(data.conversion?.id)?data.conversion.id:conversionId,'ai',language==='auto'?detectLanguage(text):language,text,apiKey.trim());
      setResult(data);setResultMode(mode==='owner'?'owner':'ai');setTimeout(()=>outputRef.current?.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}),100);
    }
    catch{if(diagnosticConsent)setConversion({id:conversionId,storage:'unavailable'});if(controller.signal.aborted){if(controller.signal.reason==='timeout'){setDiagnostic(safeDiagnostic(null,0,'CLIENT_TIMEOUT','client_timeout'));setError('通信が75秒以内に完了しませんでした。');}}else{setDiagnostic(safeDiagnostic(null,0,'CLIENT_NETWORK_ERROR','client_network'));setError('サーバーに接続できませんでした。接続状況を確認してください。');}}
    finally{clearTimeout(timeout);setBusy(false);abortRef.current=null;}
  }
  async function copyConversion(){if(!conversion)return;try{await navigator.clipboard.writeText(conversion.id);setConversionCopied(true);}catch{setConversionCopied(false);}}
  async function copyDiagnostic(){if(!diagnostic)return;try{await navigator.clipboard.writeText(JSON.stringify(diagnostic,null,2));setDiagnosticCopied(true);}catch{setDiagnosticCopied(false);}}
  function hasSelection(){return Boolean(window.getSelection()?.toString());}
  function startSwipe(event:React.TouchEvent<HTMLDivElement>){
    const point=event.touches[0];swipeStartRef.current=null;
    if(event.touches.length!==1||hasSelection()||point.clientX<20||point.clientX>window.innerWidth-20)return;
    if(event.target instanceof Element&&event.target.closest('button,a,input,textarea,select'))return;
    swipeStartRef.current={x:point.clientX,y:point.clientY,time:Date.now()};
  }
  function moveSwipe(event:React.TouchEvent<HTMLDivElement>){const start=swipeStartRef.current;if(!start)return;const point=event.touches[0];if(event.touches.length!==1||isVerticalGesture(start,point.clientX,point.clientY))swipeStartRef.current=null;}
  function endSwipe(event:React.TouchEvent<HTMLDivElement>){const start=swipeStartRef.current;swipeStartRef.current=null;if(event.changedTouches.length!==1||event.touches.length)return;const point=event.changedTouches[0];const direction=resultSwipe(start,{x:point.clientX,y:point.clientY,time:Date.now()},hasSelection());if(direction)setShowOriginal(direction==='before');}
  function keyView(event:React.KeyboardEvent<HTMLDivElement>){if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||hasSelection())return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();setShowOriginal(event.key==='ArrowLeft');}}
  function undoEdit(start:number){if(!result)return;const edits=result.edits.filter(e=>e.start!==start);let rewritten='',cursor=0;for(const e of edits){rewritten+=result.original.slice(cursor,e.start)+e.replacement;cursor=e.end;}rewritten+=result.original.slice(cursor);const changedWords=changedWordCount(result.original,rewritten);setResult({...result,edits,rewritten,changedWords,ratio:Math.round(changedWords/result.totalWords*1000)/10,notes:[...result.notes.filter(n=>!n.startsWith('変更を取り消し')),'変更を取り消した箇所は、原文に戻しています。']});setCopied(false);}
  async function copy(){if(!result)return;try{await navigator.clipboard.writeText(result.rewritten);setCopied(true);setTimeout(()=>setCopied(false),2200);}catch{setError('コピーできませんでした。言い換え後の文章を長押しして選択・コピーしてください。');}}
  function clear(){if(text && !window.confirm('入力中の文章と結果を消去しますか？'))return;updateText('');textareaRef.current?.focus();}
  return <div className="app-shell">
    <header className="site-header"><a className="brand" href="/" aria-label="表現スクランブラ ホーム"><span className="brand-mark" aria-hidden="true"><span/><span/><span/></span><span>表現スクランブラ</span></a><div className="header-right"><a className="help-link" href="/guide">APIキーの使い方<ArrowUpRight size={13}/></a></div></header>
    <main>
      <section className="intro">
        <h1>テキストの語句置換</h1>
        <p className="intro-description">日本語・英語の文章を、辞書またはGroq APIで処理します。</p>
      </section>

      <div className="workspace-heading"><h2>変換方法</h2></div>
      <div className={OWNER_KEY_MODE_ENABLED?"mode-selector":"mode-selector two-modes"} aria-label="変換モード">{OWNER_KEY_MODE_ENABLED&&<button type="button" className={mode==='owner'?'selected':''} aria-pressed={mode==='owner'} disabled={busy} onClick={()=>{setMode('owner');setError('');}}><span>AI・提供者のキー<small>{ownerAvailable===null?'設定状態を確認中':ownerAvailable?'サーバー設定のキーを使用':'未設定・実行不可'}</small></span><span className="mode-check">{mode==='owner'&&<Check size={15}/>}</span></button>}<button type="button" className={mode==='ai'?'selected':''} aria-pressed={mode==='ai'} disabled={busy} onClick={()=>{setMode('ai');setError('');}}><span>AI変換<small>自分のGroq APIキー</small></span><span className="mode-check">{mode==='ai'&&<Check size={15}/>}</span></button><button type="button" className={mode==='preset'?'selected':''} aria-pressed={mode==='preset'} disabled={busy} onClick={()=>{setMode('preset');setError('');}}><BookOpen size={16}/><span>辞書変換（簡易）<small>キー不要・端末内で処理</small></span><span className="mode-check">{mode==='preset'&&<Check size={15}/>}</span></button></div>
      {mode==='preset'?<div className="preset-options"><div><label htmlFor="preset-style">文体プリセット</label><div className="select-wrap"><select id="preset-style" value={presetStyle} onChange={e=>setPresetStyle(e.target.value as StyleId|'auto')}><option value="auto">自動分類</option><option value="business">丁寧・ビジネス</option><option value="academic">フォーマル・説明文</option><option value="casual">カジュアル・日常</option></select><ChevronDown size={13}/></div></div>{text.trim()&&<p>推定：{classification.label}</p>}<span>選択辞書：{dictionaryLanguage==='ja'?'日本語':'英語'}・{dictionaryCount}表現</span></div>:mode==='owner'?<div className="ai-settings"><div className="ai-settings-title"><LockKeyhole size={15}/><strong>提供者のGroqキー</strong><span>{ownerAvailable?'設定済み':'未設定'}</span></div><p>提供者がサーバーの秘密情報として設定したキーを使います。入力文はサイトのサーバー経由でGroqに送信され、利用量は提供者の利用枠・料金に計上されます。訪問者にキーの値は渡しません。</p>{!ownerAvailable&&<p className="owner-unavailable">実行不可：サーバー秘密情報 GROQ_OWNER_API_KEY が未設定、または状態を確認できません。チャットやこの画面に提供者キーを入力しないでください。</p>}<label className="consent-check"><input type="checkbox" checked={ownerConsent} onChange={e=>setOwnerConsent(e.target.checked)} disabled={busy||!ownerAvailable}/>送信先と利用枠を確認し、提供者のキーで実行します</label><div className="ai-links"><a href="https://console.groq.com/docs/your-data" target="_blank" rel="noreferrer noopener">Groqのデータ取り扱い<ArrowUpRight size={11}/></a></div></div>:<div className="ai-settings"><div className="ai-settings-title"><LockKeyhole size={15}/><strong>Groq APIキー</strong><span>GPT-OSS 20B</span></div>{!apiKey.trim()&&<details className="key-onboarding"><summary>APIキーを持っていない方へ</summary><p>Groqは、このツールのAI変換を動かすサービスです。最初に、ご自身のアカウントとAPIキーを用意します。</p><ol><li><a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">GroqのAPI Keysを開いて登録・ログイン</a></li><li>「API Keys」で「Create API Key」を選ぶ</li><li>コピーしたキーを下の欄に貼り付ける</li></ol><p>所要時間の目安：5〜10分。実測値ではなく、ログインや認証の手続きで変わります。</p><a href="/guide">図解つきの取得・使用手順 →</a><p className="onboarding-note">無料で試す場合はFreeプランを確認し、有料アップグレードは行わないでください。キーは他人に共有しないでください。</p></details>}<div className="key-input-row"><input ref={apiKeyRef} id="api-key" aria-label="Groq APIキー" type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="gsk_…" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} disabled={busy}/><button type="button" onClick={()=>{if(apiKeyRef.current)apiKeyRef.current.value='';setApiKey('');setKeyConsent(false);}} disabled={!apiKey||busy}>キーを消去</button></div><p>実行時に、キーと文章をこのサイトの中継サーバーからGroqへ送信します。利用枠・料金はご自身のGroq契約に従います。</p><details className="key-handling"><summary>APIキーの扱い</summary><ul><li>キーを貼り付ける、送信設定を変えるだけでは送信しません。変換の実行ボタンを押すと送信します。</li><li>経路はブラウザ → このサイトの中継サーバー → Groqです。中継サーバーは認証のためキーを処理します。キーを中継サーバーから隠す仕組みではありません。</li><li>アプリはキーをブラウザの永続保存領域、通常の診断データベース、アプリのログへ保存しません。画面とサーバーで処理に必要な間だけ扱います。</li><li>「キーを消去」で入力と送信の選択を消せます。ページの再読み込みや移動時にもアプリの一時状態を消去します。ブラウザの保存機能、拡張機能、クリップボード、配信基盤全体までの非保存・安全性は保証できません。</li><li>任意の問題報告へ、APIキー欄の値を付け加えることはありません。報告の本文にもキーを記入しないでください。</li></ul><p><a href="/privacy#api-key" target="_blank" rel="noopener noreferrer">送信先・保存・データの扱いを確認する</a></p></details><label className="consent-check"><input type="checkbox" checked={keyConsent} onChange={e=>setKeyConsent(e.target.checked)} disabled={busy}/>自分のキーと文章をGroqへ送信する</label><div className="ai-links"><a href="/guide">キーの取得・使用手順<ArrowUpRight size={11}/></a><a href="https://console.groq.com/keys" target="_blank" rel="noreferrer noopener">Groqでキーを確認<ArrowUpRight size={11}/></a><a href="https://console.groq.com/docs/your-data" target="_blank" rel="noreferrer noopener">Groqのデータ取り扱い<ArrowUpRight size={11}/></a></div></div>}
      <div className="workspace-grid">
        <section className="editor-panel"><div className="panel-heading"><div><h3>入力</h3></div><button type="button" className="icon-button" onClick={clear} disabled={!text||busy} aria-label="入力を消去"><RotateCcw size={16}/></button></div>
          <div className="language-row"><label htmlFor="language">入力の言語</label><div className="select-wrap"><select id="language" value={language} disabled={busy} onChange={e=>setLanguage(e.target.value as InputLanguage)}><option value="auto">自動判定</option><option value="ja">日本語</option><option value="en">English</option></select><ChevronDown size={13}/></div>{language==='auto'&&actualLanguage&&<span className="detected-language">{actualLanguage==='ja'?'日本語を推定':'Englishを推定'}</span>}</div>
          <p className="input-hint" id="source-text-hint">4語以上、3,000文字以内。</p>
          <label className="sr-only" htmlFor="source-text">入力テキスト</label><textarea ref={textareaRef} id="source-text" aria-describedby={error?'source-text-hint input-error':'source-text-hint'} value={text} onChange={e=>updateText(e.target.value)} disabled={busy} placeholder="置き換えたい文章を入力" spellCheck={false}/>
          <div className="input-feedback" ref={errorRef}>
      {error&&<div id="input-error" className="error-box" role="alert" aria-atomic="true"><Info size={18}/><span>{error}</span><button type="button" className="icon-button" onClick={()=>{setError('');setDiagnostic(null);}} aria-label="エラーを閉じる"><X size={16}/></button></div>}
      {error&&diagnostic&&<details className="diagnostic-panel"><summary>診断情報・エラーレポート</summary><div><strong>診断情報</strong><button type="button" onClick={copyDiagnostic}>{diagnosticCopied?'コピー完了':'診断情報をコピー'}</button></div><dl><dt>コード</dt><dd>{diagnostic.code}</dd><dt>処理段階</dt><dd>{diagnostic.stage}</dd><dt>HTTP / Groq</dt><dd>{diagnostic.httpStatus||'応答なし'} / {diagnostic.upstreamStatus??'未到達・不明'}</dd><dt>リクエストID</dt><dd>{diagnostic.requestId}</dd><dt>版 / 時刻</dt><dd>{diagnostic.version} / {diagnostic.timestamp}</dd></dl><p>コピー対象は上記のコード・ID・版・段階・ステータス・時刻のみです。入力文・APIキー・サーバーの生のエラーは含みません。</p><ErrorReportButton diagnostic={diagnostic}/></details>}
      {error&&execution&&conversion&&!busy&&<IssueReportForm initialCategory="other" key={`error-${diagnostic&&isConversionId(diagnostic.requestId)?diagnostic.requestId:conversion.id}`} conversionId={diagnostic&&isConversionId(diagnostic.requestId)?diagnostic.requestId:conversion.id} version={APP_VERSION} mode={execution.mode} language={execution.language} original={execution.original} rewritten="" containsCurrentKey={value=>Boolean(apiKey.trim())&&value.includes(apiKey.trim())}/>}
          </div>
          <div className="editor-meta"><span>{wordCount?`${wordCount} 語`:'0 語'}</span><span className={text.length>MAX_CHARS?'over-limit':''}>{text.length.toLocaleString()} <span>/ 3,000 文字</span></span></div>
          <details className="sample-row"><summary>サンプルを入力</summary><div className="sample-top"><span>言語</span><div className="language-tabs" aria-label="サンプルの言語"><button type="button" className={sampleLanguage==='ja'?'selected':''} aria-pressed={sampleLanguage==='ja'} onClick={()=>setSampleLanguage('ja')} disabled={busy}>日本語</button><button type="button" className={sampleLanguage==='en'?'selected':''} aria-pressed={sampleLanguage==='en'} onClick={()=>setSampleLanguage('en')} disabled={busy}>EN</button></div></div><div className="sample-buttons">{samples[sampleLanguage].map(s=><button type="button" key={s.label} onClick={()=>loadSample(s.text)} disabled={busy}>{s.label}<ArrowUpRight size={12}/></button>)}</div></details>
          <div className="execution-notices"><p>実行ボタンを押すと、<a href="/terms">利用規約</a>に同意したものとします。<a href="/privacy">データの扱い</a></p><label className="consent-check"><input id="send-diagnostics" type="checkbox" checked={diagnosticConsent} disabled={!diagnosticPreferenceReady} onChange={e=>chooseDiagnosticPreference(e.target.checked)}/>診断情報を送信する</label><p>不具合調査・改善のため、実行時に件数や処理時間を送信します。本文・APIキーは含みません。<a href="/privacy#diagnostics">詳細</a></p><label className="consent-check"><input id="attach-diagnostic-text" type="checkbox" checked={diagnosticTextRequested} disabled={!diagnosticConsent||!diagnosticPreferenceReady} onChange={e=>chooseTextPreference(e.target.checked)}/>原文・変換結果を送信する（任意）</label><p>変換後に運営者へ自動送信します。機密情報は入力しないでください。<a href="/privacy#text-reports">詳細</a></p>{diagnosticPreferenceWarning&&<p role="status">このブラウザでは診断設定の保存・復元を確認できません。現在の選択はこのページで有効です。</p>}</div>
          <div className="submit-area"><button type="button" className="primary-button" onClick={rewrite} disabled={busy||!diagnosticPreferenceReady||!text.trim()||text.length>MAX_CHARS||(mode==='owner'&&!ownerAvailable)}>{busy&&<LoaderCircle className="spinning" size={18}/>}<span>{busy?'Groq API 応答待ち…':diagnosticConsent&&diagnosticTextRequested?'変換して本文も送信':mode==='preset'?'辞書で置き換える':'Groqで置き換える'}</span>{!busy&&<ArrowRight size={18}/>}</button>{busy?<button type="button" className="cancel-button" onClick={()=>{cancelAutomaticText();abortRef.current?.abort('cancel');}}>キャンセル</button>:<p><ShieldCheck size={12}/>{mode==='preset'?'辞書変換はこの端末内で処理します。':mode==='owner'?'実行すると、文章をGroqへ送信し、提供者の利用枠を消費します。':'実行すると、キーと文章をGroqへ送信します。'}</p>}</div>
        </section>
        <section className={`result-panel ${result?'has-result':''}`} ref={outputRef} aria-live="polite" aria-busy={busy}><div className="panel-heading"><div><h3>結果</h3></div>{result?<button type="button" className={`copy-button ${copied?'copied':''}`} onClick={copy}>{copied?<Check size={14}/>:<Copy size={14}/>}<span>{copied?'コピー完了':'結果をコピー'}</span></button>:<span className="result-status">{busy?'調整中':'入力待ち'}</span>}</div>
          {result?<><div className="result-toolbar"><div className="view-tabs" aria-label="表示する文章"><button type="button" className={showOriginal?'active':''} onClick={()=>setShowOriginal(true)} aria-pressed={showOriginal}>変換前</button><button type="button" className={!showOriginal?'active':''} onClick={()=>setShowOriginal(false)} aria-pressed={!showOriginal}>変換後</button></div><label className="toggle"><input type="checkbox" checked={showChanges} onChange={e=>setShowChanges(e.target.checked)}/><span/>変更を表示</label></div><p className="swipe-hint">左右スワイプでも切り替えられます</p><div className="result-text" tabIndex={0} aria-label={showOriginal?'変換前の文章':'変換後の文章'} onTouchStart={startSwipe} onTouchMove={moveSwipe} onTouchEnd={endSwipe} onTouchCancel={()=>{swipeStartRef.current=null;}} onKeyDown={keyView}>{showChanges?<Highlighted result={result} original={showOriginal}/>:showOriginal?result.original:result.rewritten}</div><div className="change-legend"><span className={showOriginal?'legend-removed':'legend-added'}/>{showOriginal?'置き換えた元の表現':'新しく置き換えた表現'}<span className="changes-count">{result.edits.length} か所</span></div><div className="style-insight"><div className="style-insight-top"><span>{resultMode==='preset'?'使用プリセット':resultMode==='owner'?'入力の文体（AI推定・提供者キー）':'入力の文体（AI推定・自分のキー）'}</span><strong>{resultMode==='preset'?resultPresetDescription:result.style.label}</strong></div><details className="style-details"><summary>文体の判定内容</summary><div className="feature-chips">{result.style.features.map((f,i)=><span key={i}>{f}</span>)}</div><p>{result.style.explanation}</p></details></div><div className="ratio-result"><div><span>単語置換率</span><strong>{result.ratio}<small>%</small></strong></div><div className="ratio-track"><i style={{width:`${Math.min(100,result.ratio)}%`}}/></div><p>{result.changedWords} / {result.totalWords} 語を変更</p><p className="ratio-definition">変更した原文の語数 ÷ 原文の総語数。</p></div>{resultMode!=='preset'&&result.selection&&<details className="edit-list selection-summary"><summary>採用結果の内訳：提案 {result.selection.proposed} 件・採用 {result.selection.accepted} 件</summary><p>APIは実行ボタン1回につき1回呼び出します。</p><ul>{Object.entries(result.selection.rejected).map(([reason,count])=><li key={reason}><span>{REJECTION_LABELS[reason as keyof typeof REJECTION_LABELS]}</span><strong>{count} 件</strong></li>)}</ul><p>保護対象語：{result.selection.protectedTerms} 件。一意な元の語句の出現番号補正：{result.selection.alignedUnique} 件。{result.selection.accepted-result.edits.length>0&&`手動で取り消し：${result.selection.accepted-result.edits.length} 件。`}</p></details>}<details className="edit-list token-list"><summary>原文の語数の内訳（{result.totalWords} 語）</summary><p>Intl.Segmenterの単語区切りです。句読点・空白を除き、助詞なども数えます。Groqの課金トークン数とは異なります。</p><ol>{words(result.original).map((word,index)=><li key={index}><span>{index+1}</span>{word}</li>)}</ol></details>{result.notes.length>0&&<ul className="result-notes">{result.notes.filter(n=>!/(?:25\s*[%％]|目標|4単語に1|4語に1)/.test(n)).map((n,i)=><li key={i}>{n}</li>)}</ul>}{result.edits.length>0&&<details className="edit-list"><summary>置き換え一覧・個別に戻す（{result.edits.length}）</summary><ul>{result.edits.map(e=><li key={e.start}><span>{e.original}<ArrowRight size={11}/><strong>{e.replacement}</strong></span><button type="button" onClick={()=>undoEdit(e.start)}>戻す</button></li>)}</ul></details>}</>:busy?<div className="empty-state loading-state"><h4>{['Groq API 応答待ち','処理を継続中','応答を待機中'][stage]}</h4><p>Groqからの応答を待っています。</p></div>:<div className="empty-state"><p>変換後の文章をここに表示します。</p></div>}
          {textStorage&&<p className="text-diagnostic-status" role="status">{textStorage==='sending'?'本文を送信中です。':textStorage==='stored'?'原文・変換結果を送信しました。':textStorage==='blocked'?'本文の送信条件を満たさないため、送信しませんでした。変換結果は利用できます。':'本文の保存を確認できません。変換結果は利用できます。'}</p>}
          {conversion&&<div className="conversion-receipt"><p>変換ID：<span>{conversion.id}</span> <button type="button" onClick={copyConversion}>{conversionCopied?'コピー済み':'コピー'}</button></p><details><summary>診断の送信状況</summary><p>{conversion.storage==='stored'?'診断情報を送信しました。':conversion.storage==='sending'?'診断情報を送信中です。':conversion.storage==='off'?'品質診断は未送信です。':'診断情報の保存を確認できません。変換結果は利用できます。'}</p></details></div>}
          {conversion&&result&&!busy&&!error&&<IssueReportForm key={conversion.id} conversionId={conversion.id} version={APP_VERSION} mode={result?resultMode==='preset'?'preset':'ai':mode==='preset'?'preset':'ai'} language={detectLanguage(result?.original??text)} original={result?.original??text} rewritten={result?.rewritten??''} containsCurrentKey={value=>Boolean(apiKey.trim())&&value.includes(apiKey.trim())}/>}
        </section>
      </div>

      <details className="guide" id="guide"><summary>処理仕様</summary><div className="guide-grid processing-specification">
        <article><h3>1. Groq方式：AIが候補を作り、アプリが採用を決めます</h3>
          <ol>
            <li><strong>入力を確認。</strong>日本語・英語に対応し、4語以上・3,000文字以内を受け付けます。言語の自動判定は文字種を使った推定です。指定した言語と原文全体をAIへ渡し、文体・語尾・前後の文脈を考慮するよう指示します。</li>
            <li><strong>同じサイトのサーバーからGroqへ送信。</strong>変換の実行ボタンを押し、キー送信が選択されている場合だけ、入力文とAPIキーを中継します。使用モデルは <code>openai/gpt-oss-20b</code>。1回の実行につきAPIを1回呼び出し、自動の追加生成・再試行は行いません。</li>
            <li><strong>完成文ではなく、編集候補を受信。</strong>JSON object形式で、文体の説明、保護する語句、最大80件の候補を受け取ります。各候補は「原文の語句」「置換先」「同じ語句の何番目の出現か（0から数える）」を持ちます。活用語尾を含む句単位で、意味・時制・肯否・敬意を保つようモデルに指示します。</li>
            <li><strong>応答形式を検証。</strong>必須項目、型、文字数、候補数、出現番号を検査し、未知の項目や壊れたJSONは応答エラーにします。APIキーを含む応答も表示しません。形式が正しくても、候補がそのまま採用されるわけではありません。</li>
            <li><strong>候補ごとに原文と接続を照合。</strong>原文に完全一致しない語句や、他の候補と重なる範囲は見送ります。同じ語句が原文に1回だけ現れる場合は出現番号を補正し、複数回現れる場合は指定番号の範囲外を推測しません。文字の途中や英単語の内部を切る範囲も見送ります。数字・URLなどの保護要素、改行数、モデルが指定した保護語、隣接語の重複、活用のつながり、検出できる意味属性の変更を確認します。原文側160文字・置換先200文字を超える候補や、語数で測った変更量が大きすぎる候補にも制限があります。</li>
            <li><strong>原文に採用分だけを適用。</strong>確定した位置を使って原文を組み直します。AIが返した完成文で全文を上書きする方式ではありません。候補がすべて見送られた場合は、原文を残し、採用0件と表示します。これらの検査だけで文法や意味の一致を保証できるわけではないため、結果の確認が必要です。</li>
          </ol>
          <p>通信・認証・利用枠・モデル応答の問題は、入力欄の下にエラーを表示します。Groqへの待ち時間は最大60秒です。「診断情報」から処理段階と固定コードを確認できます。キーの経路・消去・保存範囲は <a href="/privacy#api-key" target="_blank" rel="noopener noreferrer">APIキーの扱い</a>を参照してください。</p>
        </article>
        <article><h3>2. 辞書方式：選ばれた文体の登録表現を照合します</h3>
          <ol>
            <li><strong>言語と文体を選択。</strong>日本語・英語ごとに、丁寧・ビジネス、フォーマル・説明文、カジュアル・日常の辞書があります。自動選択では語尾・定型表現などのルールから文体を推定し、手動選択では指定した辞書を使います。</li>
            <li><strong>登録された語句を検索。</strong>原文に一致する表現を候補にします。AIによる意味理解や、未知の言い換えの生成は行いません。登録がない表現は候補になりません。</li>
            <li><strong>境界と保護条件を検査。</strong>英語の単語境界、日本語の複合語・敬語の接続、引用・URLなどの保護範囲、候補同士の重複を確認してから適用します。辞書方式でも文脈に合わない置換が残る可能性があります。</li>
            <li><strong>端末内で変換。</strong>辞書の照合と置換のために本文を外部へ送信しません。診断設定で原文・変換結果の送信が選ばれている場合は、変換成功後にその両方を運営者の診断用データベースへ送信します。本文送信をオフにしても変換できます。</li>
          </ol>
        </article>
        <article><h3>3. 結果の表示と取り消し</h3>
          <p>変更箇所を強調表示し、変換前・変換後をタブまたは左右スワイプで切り替えられます。置換の一覧から1件ずつ取り消すと、文章と件数・置換率を再計算します。コピーされるのは、その時点の変換後の文章です。</p>
          <p>単語数は <code>Intl.Segmenter</code> の単語分割を使います。単語置換率は、全文の変換前後を同じ語順で照合するLCS（最長共通部分列）から、原文のどの語が残らなかったかを数え、「変更した原文の語数 ÷ 原文の総語数」で求めます。候補の数や文字数の割合ではなく、自然さ・意味の正しさ・ウォーターマークへの効果を示す値でもありません。</p>
          <p>Groq方式の「採用結果の内訳」では提案数・採用数・見送った理由の件数を、辞書方式では使用した言語・文体のプリセットを確認できます。変換IDは診断や任意の問題報告を照合するための参照番号です。件数・処理時間の診断と原文・変換結果の送信は、実行前の設定で選べます。本文送信が選択されている場合は変換成功後に送信し、失敗した入力を自動送信することはありません。</p>
        </article>
      </div></details>
      <p className="privacy-links"><a href="/terms">利用規約</a>・<a href="/privacy">プライバシー説明</a>・<a href="/contact">お問い合わせ</a></p>
    </main><footer><span>© 2026 codeswitcher</span><p>作成者：自我巨大児</p><span className="footer-language">JA / EN · 2026.10.18-r32</span><a href="https://github.com/likefack/word-scrambler" target="_blank" rel="noopener noreferrer">ソースコード（GitHub）</a><a href="/licenses">ライセンス・出典</a></footer>
  </div>;
}
