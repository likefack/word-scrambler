import {validateAutomaticTextDiagnostic,type AutomaticTextDiagnostic} from './automatic-text-diagnostics';
import {isConversionId} from './conversion-diagnostics';
export type AutomaticTextStorage='sending'|'stored'|'blocked'|'unavailable'|'cancelled';
export async function sendAutomaticTextDiagnostic(input:AutomaticTextDiagnostic,signal:AbortSignal):Promise<AutomaticTextStorage>{
 if(signal.aborted)return 'cancelled';
 const checked=validateAutomaticTextDiagnostic(input);if(!checked.ok)return 'blocked';
 try{
  const response=await fetch('/api/automatic-text-diagnostics',{method:'POST',credentials:'same-origin',redirect:'error',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(checked.value),signal});
  if(!response.ok)return response.status===400?'blocked':'unavailable';
  const reader=response.body?.getReader();if(!reader)return 'unavailable';let bytes=0;const chunks:Uint8Array[]=[];
  try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>2048){void reader.cancel().catch(()=>{});return 'unavailable';}chunks.push(value);}}
  finally{reader.releaseLock();}
  const all=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength;}
  const raw:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return 'unavailable';const data=raw as Record<string,unknown>;
  return response.status===201&&Object.keys(data).length===1&&isConversionId(data.reportId)&&data.reportId===input.reportId?'stored':'unavailable';
 }catch{return signal.aborted?'cancelled':'unavailable';}
}
