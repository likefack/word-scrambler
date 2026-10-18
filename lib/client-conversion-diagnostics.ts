import { projectConversionMetrics, type ConversionMetrics } from './conversion-diagnostics';
export type ConversionStorage = 'off'|'sending'|'stored'|'unavailable'|'rate_limited';
/** This path accepts content-free preset metrics only. Never pass an entire result. */
export async function sendPresetDiagnostics(metrics:ConversionMetrics, signal:AbortSignal):Promise<ConversionStorage>{
  const data=projectConversionMetrics(metrics);
  if(!data||data.mode!=='preset')return 'unavailable';
  try{
    const response=await fetch('/api/conversion-diagnostics',{method:'POST',credentials:'same-origin',redirect:'error',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent:true,metrics:data}),signal});
    const body=await response.json() as {storage?:unknown};
    if(response.ok&&body.storage==='stored')return 'stored';
    return body.storage==='rate_limited'?'rate_limited':'unavailable';
  }catch{return 'unavailable';}
}
