import { env } from 'cloudflare:workers';
import { admitPublicApi } from '../../../lib/public-api-admission';
import { DIAGNOSTIC_BODY_LIMIT, validateConversionMetrics } from '../../../lib/conversion-diagnostics';
import { storeConversionMetrics } from '../../../lib/server-conversion-diagnostics';

export const dynamic = 'force-dynamic';
const reply=(status:number,storage:string)=>Response.json({storage},{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function read(request:Request):Promise<unknown>{
  const length=request.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>DIAGNOSTIC_BODY_LIMIT))throw new Error('size');
  const reader=request.body?.getReader();if(!reader)throw new Error('body');
  const chunks:Uint8Array[]=[];let size=0;let timer:ReturnType<typeof setTimeout>|undefined;
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),10000);});
  try{while(true){const {done,value}=await Promise.race([reader.read(),timeout]);if(done)break;size+=value.byteLength;if(size>DIAGNOSTIC_BODY_LIMIT)throw new Error('size');chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }catch{void reader.cancel().catch(()=>{});throw new Error('invalid');}
  finally{clearTimeout(timer);reader.releaseLock();}
}
// No GET/list route. Browser-reported figures can never be labeled ai_server.
export async function POST(request:Request){
  try{
    if(request.method!=='POST')return reply(405,'unavailable');
    if(request.headers.get('origin')!==new URL(request.url).origin)return reply(403,'unavailable');
    if(!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i.test(request.headers.get('content-type')??'')||!['', 'identity'].includes(request.headers.get('content-encoding')??''))return reply(415,'unavailable');
    const admission=await admitPublicApi((env as {DB?:D1Database}).DB,'diagnostics');
    if(!admission.allowed)return reply(admission.status,admission.status===429?'rate_limited':'unavailable');
    const raw=await read(request);
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return reply(400,'unavailable');
    const body=raw as Record<string,unknown>;
    if(Object.keys(body).length!==2||body.consent!==true||!Object.hasOwn(body,'metrics'))return reply(400,'unavailable');
    const metrics=validateConversionMetrics(body.metrics);
    if(!metrics||metrics.mode!=='preset')return reply(400,'unavailable');
    const storage=await storeConversionMetrics((env as {DB?:D1Database}).DB,metrics,'preset_client');
    return reply(storage==='stored'?200:storage==='rate_limited'?429:503,storage);
  }catch{return reply(503,'unavailable');}
}
