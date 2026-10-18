/** A single non-secret browser setting. Never pass text, keys or result objects. */
export const DIAGNOSTIC_PREFERENCE_KEY='expression-scrambler.diagnostics.v1';
type PreferenceStore=Pick<Storage,'getItem'|'setItem'>;
export type DiagnosticPreference={enabled:boolean;status:'ready'|'unavailable'|'invalid'};
export function readDiagnosticPreference(getStore:()=>PreferenceStore):DiagnosticPreference{
 try{
  const value=getStore().getItem(DIAGNOSTIC_PREFERENCE_KEY);
  if(value===null)return {enabled:true,status:'ready'};
  if(value==='on'||value==='off')return {enabled:value==='on',status:'ready'};
  return {enabled:false,status:'invalid'};
 }catch{return {enabled:false,status:'unavailable'};}
}
export function saveDiagnosticPreference(getStore:()=>PreferenceStore,enabled:boolean):boolean{
 if(typeof enabled!=='boolean')return false;
 try{getStore().setItem(DIAGNOSTIC_PREFERENCE_KEY,enabled?'on':'off');return true;}catch{return false;}
}
