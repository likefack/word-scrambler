/** Fixed diagnostic schema. Never add text, keys, phrases, identities or free-form values. */
export const DIAGNOSTIC_CONSENT_VERSION = '2026-10-18.3';
export const DIAGNOSTIC_BODY_LIMIT = 4096;
export const DIAGNOSTIC_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const DIAGNOSTIC_MAX_ROWS = 1000;
export const REJECTION_CATEGORIES = ['context_duplicate','grammar_join','scope_change','semantic_attribute','invalid_edit','unchanged','original_not_found','occurrence_out_of_range','overlap','immutable_change','newline_change','edit_too_large','total_budget','target_reached','protected_term','full_text_budget','limit'] as const;
export type RejectionCategory = typeof REJECTION_CATEGORIES[number];
export const CONVERSION_STAGES = ['input_validation','preset_selection','provider_fetch','provider_status','provider_body','provider_content','output_validation','complete','client_request','client_response','client_network','client_timeout','key_selection','admission'] as const;
export const PROVIDER_CATEGORIES=['none','invalid_request','schema_validation','model_permission','authentication','rate_limit','unavailable','unknown'] as const;
export type ConversionMetrics = {
 conversionId:string; version:string; consentVersion:typeof DIAGNOSTIC_CONSENT_VERSION;
 mode:'preset'|'ai'; providerCategory:typeof PROVIDER_CATEGORIES[number]; language:'ja'|'en'|'unknown'; style:'business'|'academic'|'casual'|'unknown';
 totalWords:number; proposed:number; applied:number; changedWords:number;
 rejected:Partial<Record<RejectionCategory,number>>;
 elapsedMs:number; providerMs:number; validationMs:number;
 status:'ok'|'failed'; stage:typeof CONVERSION_STAGES[number];
};
export const isConversionId=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const fields=['conversionId','version','consentVersion','mode','providerCategory','language','style','totalWords','proposed','applied','changedWords','rejected','elapsedMs','providerMs','validationMs','status','stage'];
const integer=(v:unknown,max:number):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=max;
/** Strict server boundary: reject unknown keys instead of storing arbitrary JSON. */
export function validateConversionMetrics(input:unknown):ConversionMetrics|null {
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 const v=input as Record<string,unknown>;
 if(Object.keys(v).length!==fields.length||Object.keys(v).some(k=>!fields.includes(k))||fields.some(k=>!Object.hasOwn(v,k)))return null;
 if(!isConversionId(v.conversionId)||typeof v.version!=='string'||!/^\d{4}\.\d{2}\.\d{2}-r\d{1,6}$/.test(v.version)||v.consentVersion!==DIAGNOSTIC_CONSENT_VERSION)return null;
 const date=new Date(v.version.slice(0,10).replaceAll('.','-')+'T00:00:00.000Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==v.version.slice(0,10).replaceAll('.','-'))return null;
 if(!PROVIDER_CATEGORIES.includes(v.providerCategory as typeof PROVIDER_CATEGORIES[number])||!['preset','ai'].includes(v.mode as string)||!['ja','en','unknown'].includes(v.language as string)||!['business','academic','casual','unknown'].includes(v.style as string)||!['ok','failed'].includes(v.status as string)||!CONVERSION_STAGES.includes(v.stage as ConversionMetrics['stage']))return null;
 if(!integer(v.totalWords,3000)||!integer(v.changedWords,3000)||v.changedWords>v.totalWords||!integer(v.proposed,512)||!integer(v.applied,512)||v.applied>v.proposed)return null;
 if(!integer(v.elapsedMs,180000)||!integer(v.providerMs,180000)||!integer(v.validationMs,180000)||v.providerMs>v.elapsedMs||v.validationMs>v.elapsedMs)return null;
 if(!v.rejected||typeof v.rejected!=='object'||Array.isArray(v.rejected))return null;
 if(v.mode==='preset'&&v.providerCategory!=='none')return null;
 const rejected:ConversionMetrics['rejected']={};
 for(const [key,value] of Object.entries(v.rejected)){if(!REJECTION_CATEGORIES.includes(key as RejectionCategory)||!integer(value,512))return null;rejected[key as RejectionCategory]=value;}
 return {conversionId:v.conversionId.toLowerCase(),version:v.version,consentVersion:DIAGNOSTIC_CONSENT_VERSION,mode:v.mode as ConversionMetrics['mode'],providerCategory:v.providerCategory as ConversionMetrics['providerCategory'],language:v.language as ConversionMetrics['language'],style:v.style as ConversionMetrics['style'],totalWords:v.totalWords,proposed:v.proposed,applied:v.applied,changedWords:v.changedWords,rejected,elapsedMs:v.elapsedMs,providerMs:v.providerMs,validationMs:v.validationMs,status:v.status as ConversionMetrics['status'],stage:v.stage as ConversionMetrics['stage']};
}
/** Browser projection: explicit values only; no object spread from a model/result. */
export function projectConversionMetrics(input:ConversionMetrics):ConversionMetrics|null {
 const rejected:ConversionMetrics['rejected']={};
 for(const key of REJECTION_CATEGORIES){const value=input.rejected?.[key];if(value!==undefined)rejected[key]=value;}
 return validateConversionMetrics({conversionId:input.conversionId,version:input.version,consentVersion:input.consentVersion,mode:input.mode,providerCategory:input.providerCategory,language:input.language,style:input.style,totalWords:input.totalWords,proposed:input.proposed,applied:input.applied,changedWords:input.changedWords,rejected,elapsedMs:input.elapsedMs,providerMs:input.providerMs,validationMs:input.validationMs,status:input.status,stage:input.stage});
}
