import { containsContactSecret } from './contact-intake';
import { isConversionId } from './conversion-diagnostics';

// This records an execution-time sending selection, not proof of explicit consent.
export const AUTOMATIC_TEXT_NOTICE_VERSION='2026-10-18.5';
export const AUTOMATIC_TEXT_LIMIT=3000;
export const AUTOMATIC_TEXT_BODY_LIMIT=32768;
export const AUTOMATIC_TEXT_MAX_ROWS=1000;
export const AUTOMATIC_TEXT_RETENTION_MS=30*86400000;
export type AutomaticTextDiagnostic={reportId:string;conversionId:string;version:string;mode:'preset'|'ai';language:'ja'|'en';original:string;rewritten:string;diagnosticsEnabled:true;selectionOnAtExecution:true;noticeVersion:typeof AUTOMATIC_TEXT_NOTICE_VERSION};
const fields=['reportId','conversionId','version','mode','language','original','rewritten','diagnosticsEnabled','selectionOnAtExecution','noticeVersion'];
export function validateAutomaticTextDiagnostic(input:unknown):{ok:true;value:AutomaticTextDiagnostic}|{ok:false;code:string}{
 if(!input||typeof input!=='object'||Array.isArray(input))return {ok:false,code:'TEXT_INVALID'};
 const v=input as Record<string,unknown>;
 if(Object.keys(v).length!==fields.length||Object.keys(v).some(k=>!fields.includes(k)))return {ok:false,code:'TEXT_INVALID'};
 if(v.diagnosticsEnabled!==true||v.selectionOnAtExecution!==true||v.noticeVersion!==AUTOMATIC_TEXT_NOTICE_VERSION)return {ok:false,code:'TEXT_SELECTION_REQUIRED'};
 if(!isConversionId(v.reportId)||!isConversionId(v.conversionId)||typeof v.version!=='string'||!/^\d{4}\.\d{2}\.\d{2}-r\d{1,6}$/.test(v.version))return {ok:false,code:'TEXT_INVALID'};
 const date=new Date(v.version.slice(0,10).replaceAll('.','-')+'T00:00:00.000Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==v.version.slice(0,10).replaceAll('.','-'))return {ok:false,code:'TEXT_INVALID'};
 if(!['preset','ai'].includes(v.mode as string)||!['ja','en'].includes(v.language as string))return {ok:false,code:'TEXT_INVALID'};
 if(typeof v.original!=='string'||typeof v.rewritten!=='string'||!v.original.trim()||!v.rewritten.trim()||v.original.length>AUTOMATIC_TEXT_LIMIT||v.rewritten.length>AUTOMATIC_TEXT_LIMIT||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v.original+v.rewritten))return {ok:false,code:'TEXT_CONTENT_INVALID'};
 if(containsContactSecret(v.original+'\n'+v.rewritten))return {ok:false,code:'TEXT_SECRET_BLOCKED'};
 return {ok:true,value:{reportId:v.reportId.toLowerCase(),conversionId:v.conversionId.toLowerCase(),version:v.version,mode:v.mode as 'preset'|'ai',language:v.language as 'ja'|'en',original:v.original,rewritten:v.rewritten,diagnosticsEnabled:true,selectionOnAtExecution:true,noticeVersion:AUTOMATIC_TEXT_NOTICE_VERSION}};
}
