import 'server-only';
import { DIAGNOSTIC_MAX_ROWS, DIAGNOSTIC_RETENTION_MS, REJECTION_CATEGORIES, validateConversionMetrics, type ConversionMetrics } from './conversion-diagnostics';
export type DiagnosticStorageStatus = 'stored'|'unavailable'|'rate_limited';
let active=false;let attempts:number[]=[];
/** Best effort per-isolate admission only. No user ID, IP, key or text is retained. */
export async function storeConversionMetrics(database:D1Database|undefined, metrics:ConversionMetrics, source:'preset_client'|'ai_server'):Promise<DiagnosticStorageStatus> {
 const data=validateConversionMetrics(metrics);
 if(!database||!data||(source==='preset_client'&&data.mode!=='preset')||(source==='ai_server'&&data.mode!=='ai'))return 'unavailable';
 const now=Date.now();attempts=attempts.filter(at=>now-at<3600000);
 if(active||attempts.length>=300||attempts.filter(at=>now-at<60000).length>=30)return 'rate_limited';
 active=true;attempts.push(now);
 const receivedAt=new Date(now).toISOString(),cutoff=new Date(now-DIAGNOSTIC_RETENTION_MS).toISOString();
 const columns=['conversion_id','source','app_version','consent_version','mode','provider_category','language','style','total_words','proposed','applied','changed_words','elapsed_ms','provider_ms','validation_ms','status','stage','server_received_at',...REJECTION_CATEGORIES.map(key=>'reject_'+key)];
 const values=[data.conversionId,source,data.version,data.consentVersion,data.mode,data.providerCategory,data.language,data.style,data.totalWords,data.proposed,data.applied,data.changedWords,data.elapsedMs,data.providerMs,data.validationMs,data.status,data.stage,receivedAt,...REJECTION_CATEGORIES.map(key=>data.rejected[key]??0)];
 let timer:ReturnType<typeof setTimeout>|undefined;
 try {
  const results=await Promise.race([database.batch([
   database.prepare('DELETE FROM conversion_diagnostics WHERE server_received_at < ?').bind(cutoff),
   database.prepare(`INSERT INTO conversion_diagnostics (${columns.join(',')}) SELECT ${columns.map(()=>'?').join(',')} WHERE (SELECT count(*) FROM conversion_diagnostics WHERE server_received_at > ?) < 30 AND (SELECT count(*) FROM conversion_diagnostics WHERE server_received_at > ?) < 300 ON CONFLICT(conversion_id) DO NOTHING`).bind(...values,new Date(now-60000).toISOString(),new Date(now-3600000).toISOString()),
   database.prepare('DELETE FROM conversion_diagnostics WHERE conversion_id IN (SELECT conversion_id FROM conversion_diagnostics ORDER BY server_received_at DESC, rowid DESC LIMIT -1 OFFSET ?)').bind(DIAGNOSTIC_MAX_ROWS),
   database.prepare('SELECT conversion_id FROM conversion_diagnostics WHERE conversion_id = ?').bind(data.conversionId),
  ]),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('storage_timeout')),2500);})]);
  if(results.length!==4||results.some(r=>!r.success))return 'unavailable';
  return results[3].results?.length?'stored':'rate_limited';
 } catch {return 'unavailable';}
 finally{clearTimeout(timer);active=false;}
}
