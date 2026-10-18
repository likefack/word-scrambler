import 'server-only';
export type ProviderFailureCategory='none'|'invalid_request'|'schema_validation'|'model_permission'|'authentication'|'rate_limit'|'unavailable'|'unknown';
/** Only closed categories leave this function. Messages/failed_generation never do. */
export async function classifyProviderFailure(response:Response,apiKey:string):Promise<ProviderFailureCategory>{
  const status=response.status;
  if(status===401)return 'authentication';
  if(status===429)return 'rate_limit';
  if(status>=500)return 'unavailable';
  const reader=response.body?.getReader();if(!reader)return 'unknown';
  const chunks:Uint8Array[]=[];let size=0,timer:ReturnType<typeof setTimeout>|undefined;
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),2000);});
  try{
    while(true){const {done,value}=await Promise.race([reader.read(),timeout]);if(done)break;size+=value.byteLength;if(size>16384)throw new Error('size');chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    if(apiKey&&raw.includes(apiKey))return 'unknown';
    const parsed:unknown=JSON.parse(raw);
    if(!parsed||typeof parsed!=='object'||(apiKey&&JSON.stringify(parsed).includes(apiKey)))return 'unknown';
    const error=(parsed as {error?:unknown}).error;
    if(!error||typeof error!=='object'||Array.isArray(error))return 'unknown';
    const {type,code}=error as {type?:unknown;code?:unknown};
    if(code==='json_validate_failed'||code==='schema_validation_failed')return 'schema_validation';
    if(code==='model_permission_denied'||code==='model_not_found'||code==='model_decommissioned')return 'model_permission';
    if(type==='invalid_request_error')return 'invalid_request';
    return 'unknown';
  }catch{return 'unknown';}
  finally{clearTimeout(timer);void reader.cancel().catch(()=>{});reader.releaseLock();}
}
