import {buildGroqRequest, validModelOutput} from '../../../lib/server-model-format';
import { classifyProviderFailure, type ProviderFailureCategory } from '../../../lib/server-provider-failure';
import { env } from 'cloudflare:workers';
import { DIAGNOSTIC_CONSENT_VERSION, type ConversionMetrics } from '../../../lib/conversion-diagnostics';
import { storeConversionMetrics } from '../../../lib/server-conversion-diagnostics';
import { classifyStyle } from '../../../lib/presets';
import { applyModelOutput, RewriteError, validateInput, detectLanguage, words, type RewriteResult } from '../../../lib/rewriter';
import { isGroqApiKey } from '../../../lib/server-groq';
import { admitPublicApi, publicJsonRequestError, type PublicApiAdmission } from '../../../lib/public-api-admission';
export const dynamic = 'force-dynamic';
const APP_VERSION = '2026.10.18-r27';
type Stage = 'origin'|'request_body'|'input_validation'|'key_selection'|'admission'|'provider_fetch'|'provider_status'|'provider_body'|'provider_content'|'output_validation'|'complete';
const json = (data: unknown, status=200, extraHeaders: Record<string,string>={}) => Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extraHeaders}});
async function boundedBody(request:Request){
  const declaredLength=request.headers.get('content-length');
  if(declaredLength!==null&&!/^\d+$/.test(declaredLength))throw new RewriteError('BAD_REQUEST','入力を読み取れませんでした。');
  if (Number(declaredLength || 0)>24000) throw new RewriteError('TOO_LONG','送信内容が大きすぎます。',413);
  const reader=request.body?.getReader(); if(!reader)throw new RewriteError('BAD_REQUEST','入力を読み取れませんでした。');
  const chunks:Uint8Array[]=[];let size=0;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new RewriteError('TIMEOUT','送信内容の読み取りがタイムアウトしました。もう一度お試しください。',408)),10000);});
  try{while(true){const {value,done}=await Promise.race([reader.read(),timeout]);if(done)break;size+=value.byteLength;if(size>24000)throw new RewriteError('TOO_LONG','送信内容が大きすぎます。',413);chunks.push(value);}}
  catch(error){
    // A stalled/malicious producer must not keep the request alive by withholding
    // its cancellation acknowledgement. Never log the key-bearing request body.
    void reader.cancel().catch(()=>{});throw error;
  }
  finally{clearTimeout(timer);reader.releaseLock();}
  const bytes=new Uint8Array(size);let pos=0;for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.byteLength;}return new TextDecoder().decode(bytes);
}
export async function POST(request: Request) {
  let admission: Extract<PublicApiAdmission, {allowed:true}> | undefined;
  const requestId=crypto.randomUUID();
  const timestamp=new Date().toISOString();
  const started=Date.now();let providerStarted=0,validationStarted=0;
  let consent=false;let metricLanguage:ConversionMetrics['language']='unknown',metricStyle:ConversionMetrics['style']='unknown',metricWords=0;
  let appliedMetrics:RewriteResult|undefined;let providerCategory:ProviderFailureCategory='none';
  let stage:Stage='origin';
  let upstreamStatus:number|undefined;
  const respond=async(data:unknown,status=200,extraHeaders:Record<string,string>={})=>{
    const body=data as Record<string,unknown>;
    const diagnostic=status>=400?{code:typeof body.code==='string'?body.code:'UNEXPECTED',requestId,version:APP_VERSION,stage,httpStatus:status,...(upstreamStatus?{upstreamStatus}:{}),timestamp}:undefined;
    let storage:'off'|'stored'|'unavailable'|'rate_limited'='off';
    if(consent){
      const now=Date.now(),elapsedMs=Math.min(180000,Math.max(0,now-started));
      try{storage=await storeConversionMetrics((env as {DB?:D1Database}).DB,{
        conversionId:requestId,version:APP_VERSION,consentVersion:DIAGNOSTIC_CONSENT_VERSION,
        mode:'ai',providerCategory,language:metricLanguage,style:metricStyle,totalWords:metricWords,
        proposed:appliedMetrics?.selection?.proposed??0,applied:appliedMetrics?.edits.length??0,changedWords:appliedMetrics?.changedWords??0,rejected:appliedMetrics?.selection?.rejected??{},
        elapsedMs,providerMs:providerStarted?Math.min(elapsedMs,Math.max(0,(validationStarted||now)-providerStarted)):0,validationMs:validationStarted?Math.min(elapsedMs,Math.max(0,now-validationStarted)):0,
        status:status<400?'ok':'failed',stage:stage as ConversionMetrics['stage'],
      },'ai_server');}catch{storage='unavailable';}
    }
    return json({...body,...(diagnostic?{diagnostic}:{}),conversion:{id:requestId,storage}},status,{'X-Request-Id':requestId,'X-App-Version':APP_VERSION,...extraHeaders});
  };
  try {
    const transport = publicJsonRequestError(request);
    if (transport) return respond({error:'このページからJSON形式で送信してください。',code:transport.code},transport.status,transport.status===405?{Allow:'POST'}:{});
    stage='request_body';
    let parsedBody: unknown; try { parsedBody=JSON.parse(await boundedBody(request)); } catch(e) { if(e instanceof RewriteError)throw e;return respond({error:'入力を読み取れませんでした。',code:'BAD_REQUEST'},400); }
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) return respond({error:'入力を読み取れませんでした。',code:'BAD_REQUEST'},400);
    const body = parsedBody as Record<string,unknown>;
    stage='key_selection';
    const keySource = body.keySource === undefined ? 'byok' : body.keySource;
    if (keySource !== 'owner' && keySource !== 'byok') return respond({error:'AIモードを選び直してください。',code:'INVALID_KEY_SOURCE'},400);
    // Public requests must never reach an owner-funded path, even if another
    // deployment accidentally changes the feature flag. No auth-header trust.
    if (keySource === 'owner') return respond({error:'提供者キー方式は無効です。機械的な置換か、自分のキー方式を選択してください。',code:'OWNER_MODE_DISABLED'},403);
    const apiKey = typeof body.apiKey==='string'?body.apiKey.trim():'';
    if (!apiKey) return respond({error:'ご自身のGroq APIキーを入力してください。機械的な言い換えはキーなしで使えます。',code:'KEY_REQUIRED'},400);
    if(!isGroqApiKey(apiKey))return respond({error:'Groq APIキーの形式を確認してください。',code:'KEY_FORMAT'},400);
    stage='admission';
    const reservation = await admitPublicApi((env as {DB?:D1Database}).DB, 'rewrite');
    if (!reservation.allowed) return respond({error:reservation.status===429?'サイト全体のAI利用が混み合っています。少し待ってからお試しください。':'安全な利用上限を確認できませんでした。時間を置いてお試しください。',code:reservation.code},reservation.status,{'Retry-After':String(reservation.retryAfter)});
    admission = reservation;
    // Source parsing and diagnostics persistence start only after confirmed D1 admission.
    consent=body.diagnosticsConsent===true&&body.diagnosticsConsentVersion===DIAGNOSTIC_CONSENT_VERSION;
    stage='input_validation';
    const text = validateInput(body.text);
    metricWords=words(text).length;metricLanguage=body.language==='ja'||body.language==='en'?body.language:detectLanguage(text);metricStyle=classifyStyle(text,metricLanguage).id;
    // Prepare all source-dependent work before the fresh lease check. A source
    // parser may use substantial CPU; its elapsed time must not buy a new lease.
    const providerBody=JSON.stringify(buildGroqRequest(text,body.language === 'ja' || body.language === 'en' ? body.language : 'auto'));
    stage='admission';
    const providerTimeout=await admission.providerTimeoutMs();
    if(providerTimeout===null)return respond({error:'安全な実行枠を確認できませんでした。時間を置いてお試しください。',code:'PUBLIC_ADMISSION_UNAVAILABLE'},503,{'Retry-After':'60'});
    stage='provider_fetch';providerStarted=Date.now();
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',redirect:'manual',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      signal:AbortSignal.any([request.signal,AbortSignal.timeout(providerTimeout)]),
      body:providerBody
    });
    stage='provider_status';upstreamStatus=response.status;
    // Workerd rejects redirect:'error'. Manual mode never follows a Location,
    // so credentials remain at the single fixed provider endpoint.
    if(response.status>=300&&response.status<400)return respond({error:'Groqの応答が別URLへの転送を要求したため、安全のため中止しました。',code:'PROVIDER_REDIRECT_BLOCKED'},502);
    if (!response.ok) {
      providerCategory=await classifyProviderFailure(response,apiKey);
      if(response.status===400&&providerCategory==='schema_validation')return respond({error:'Groqが編集結果の形式検証に失敗しました。下の問題報告から、この実行の情報を送信できます。',code:'PROVIDER_SCHEMA_VALIDATION'},502);
      if(response.status===400&&providerCategory==='invalid_request')return respond({error:'Groqがリクエスト形式を受け付けませんでした。診断情報を使って問い合わせできます。',code:'PROVIDER_INVALID_REQUEST'},502);
      if(providerCategory==='model_permission')return respond({error:'Groqのモデル利用条件または利用権限を確認できませんでした。',code:'PROVIDER_MODEL_PERMISSION'},502);
      if (response.status === 429) return respond({error:'Groqの利用枠または一時的な混雑に達しました。少し待つか、無料のプリセットモードをお使いください。',code:'RATE_LIMIT'},429);
      if (response.status === 401 || response.status === 403) return respond({error:'Groq APIキーの認証・権限を確認できませんでした。入力とGroqの設定を確認してください。',code:'PROVIDER_AUTH'},response.status);
      if(response.status===413)return respond({error:'Groqがリクエストサイズを拒否しました。文章を短くしてください。',code:'PROVIDER_PAYLOAD_TOO_LARGE'},413);
      return respond({error:'Groqで処理できませんでした。診断情報のコードとステータスを確認してください。',code:response.status>=500?'PROVIDER_5XX':'PROVIDER_HTTP_ERROR'},502);
    }
    stage='provider_body';
    const reader=response.body?.getReader();
    if(!reader)return respond({error:'Groqの応答が空でした。',code:'EMPTY_PROVIDER_RESPONSE'},502);
    const chunks:Uint8Array[]=[];let responseSize=0;
    try{while(true){const {value,done}=await reader.read();if(done)break;responseSize+=value.byteLength;if(responseSize>262144){await reader.cancel();return respond({error:'Groqの応答サイズが上限を超えました。',code:'PROVIDER_RESPONSE_TOO_LARGE'},502);}chunks.push(value);}}finally{reader.releaseLock();}
    const bytes=new Uint8Array(responseSize);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const responseText=new TextDecoder().decode(bytes);
    if(!responseText.trim())return respond({error:'Groqの応答が空でした。',code:'EMPTY_PROVIDER_RESPONSE'},502);
    if(responseText.includes(apiKey))return respond({error:'応答に機密情報が含まれる可能性があるため、表示を中止しました。',code:'SENSITIVE_OUTPUT_BLOCKED'},502);
    let output:unknown;try{output=JSON.parse(responseText);}catch{return respond({error:'Groqの応答がJSON形式ではありませんでした。',code:'PROVIDER_NON_JSON'},502);}
    if(!output||typeof output!=='object'||JSON.stringify(output).includes(apiKey))return respond({error:'Groqの応答形式を確認できませんでした。',code:'PROVIDER_ENVELOPE_INVALID'},502);
    const envelope=output as {choices?:Array<{finish_reason?:string;message?:{content?:string;refusal?:string}}>};
    const choice=Array.isArray(envelope.choices)?envelope.choices[0]:undefined;
    stage='provider_content';
    if(choice?.message?.refusal)return respond({error:'この文章の言い換えには対応できませんでした。',code:'REFUSAL'},422);
    if(!choice?.message||typeof choice.message.content!=='string'||!choice.message.content.trim())return respond({error:'Groqから編集結果が返されませんでした。',code:'EMPTY_PROVIDER_CONTENT'},502);
    if(choice.finish_reason!=='stop')return respond({error:'AIの処理が完了しませんでした。文章を短くしてください。',code:'INCOMPLETE'},502);
    let parsed:unknown;try{parsed=JSON.parse(choice.message.content);}catch{return respond({error:'編集結果をJSONとして読み取れませんでした。',code:'CONTENT_NON_JSON'},502);}
    if(JSON.stringify(parsed).includes(apiKey))return respond({error:'応答に機密情報が含まれる可能性があるため、表示を中止しました。',code:'SENSITIVE_OUTPUT_BLOCKED'},502);
    stage='output_validation';validationStarted=Date.now();
    if(!validModelOutput(parsed))return respond({error:'編集結果が必要な形式または件数制限に適合しませんでした。',code:'OUTPUT_SCHEMA_INVALID'},502);
    const applied=applyModelOutput(text,parsed,{alignUniqueOccurrence:true,checkContextGrammar:true});appliedMetrics=applied;stage='complete';return respond(applied);
  }catch(error){
    if(error instanceof RewriteError)return respond({error:error.message,code:error.code},error.status);
    if(error instanceof Error&&['TimeoutError','AbortError'].includes(error.name))return respond({error:'処理が中断またはタイムアウトしました。文章を短くしてお試しください。',code:'TIMEOUT'},504);
    const code=stage==='provider_fetch'?'PROVIDER_NETWORK_ERROR':stage==='provider_body'?'PROVIDER_READ_ERROR':stage==='input_validation'?'INPUT_RUNTIME_ERROR':'UNEXPECTED';
    return respond({error:'処理に失敗しました。入力は残っています。下の診断情報を確認してください。',code},stage.startsWith('provider')?502:500);
  }finally{await admission?.release();}
}
