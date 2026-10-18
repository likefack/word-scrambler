import { env } from 'cloudflare:workers';
import { CONTACT_MAIL_MAX_BYTES, contactMailConfiguration, verifyContactMailSignature, type ContactMailEnvironment } from '../../../lib/contact-mail-auth';
import { CONTACT_RETENTION_MS, containsContactSecret, isContactSubmissionId } from '../../../lib/contact-intake';
export const dynamic = 'force-dynamic';
const answer = (status: number, value: object) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
class BoundaryError extends Error { constructor(readonly status:number,readonly code:string){super(code);} }
async function deadline<T>(operation:Promise<T>,ms:number,code:string):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new BoundaryError(503,code)),ms);})]);}
  finally{clearTimeout(timer);}
}
async function readBody(request:Request){
  if(request.headers.get('content-encoding'))throw new BoundaryError(415,'ENCODING_UNSUPPORTED');
  const declared=request.headers.get('content-length');
  if(declared&&(!/^\d+$/.test(declared)||Number(declared)>CONTACT_MAIL_MAX_BYTES))throw new BoundaryError(413,'TOO_LARGE');
  const reader=request.body?.getReader();if(!reader)throw new BoundaryError(400,'INVALID');
  const chunks:Uint8Array[]=[];let size=0;
  try{
    await deadline((async()=>{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;
      if(size>CONTACT_MAIL_MAX_BYTES)throw new BoundaryError(413,'TOO_LARGE');chunks.push(part.value);}})(),5000,'BODY_TIMEOUT');
    const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
    return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  }finally{void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{/* Pending read may still settle after timeout. */}}
}
type Action={action:'health'|'claim'}|{action:'start'|'ack'|'unknown'|'defer';id:string;claimId:string};
function parseAction(body:string):Action|null{
  let value:unknown;try{value=JSON.parse(body);}catch{return null;}
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const data=value as Record<string,unknown>,keys=Object.keys(data);
  if((data.action==='health'||data.action==='claim')&&keys.length===1)return {action:data.action};
  if(['start','ack','unknown','defer'].includes(String(data.action))&&keys.length===3&&keys.every(k=>['action','id','claimId'].includes(k))&&isContactSubmissionId(data.id)&&isContactSubmissionId(data.claimId))return data as Action;
  return null;
}
// Public service route: HMAC is required for every operation, independently of
// visitor sign-in. A Site service token, if used, is not treated as visitor identity.
// No GET, configuration mutation, email sending, user-supplied recipient, or URL.
export async function POST(request: Request) {
  try {
    if(request.method!=='POST')return answer(405,{code:'METHOD_NOT_ALLOWED'});
    const environment=env as ContactMailEnvironment & {DB?:D1Database};
    const {DB:db,CONTACT_MAIL_HMAC_SECRET:secret}=environment;
    if (!db || typeof secret!=='string' || secret.length<32) return answer(503, { code: 'NOT_CONFIGURED' });
    if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '')) return answer(415, { code: 'JSON_REQUIRED' });
    const body=await readBody(request),now=Date.now();
    const nonce=await verifyContactMailSignature(request,body,secret,now);
    if(!nonce)return answer(401,{code:'UNAUTHORIZED'});
    const data=parseAction(body);if(!data)return answer(400,{code:'INVALID'});
    const replay=await deadline(db.batch([
      db.prepare('DELETE FROM contact_mail_nonces WHERE expires_at < ?').bind(now),
      db.prepare('INSERT OR IGNORE INTO contact_mail_nonces(nonce, expires_at) VALUES (?,?)').bind(nonce,now+240_000),
    ]),3000,'DB_TIMEOUT');
    if(replay[1].meta.changes!==1)return answer(409,{code:'REPLAY'});
    const config=contactMailConfiguration(environment);
    if(data.action==='health')return answer(200,{code:'OK',enabled:config.enabled});
    if(data.action==='claim'){
      if(!config.enabled)return answer(200,{code:'PAUSED',item:null});
      const claimId=crypto.randomUUID(),cutoff=new Date(now-CONTACT_RETENTION_MS).toISOString();
      const result=await deadline(db.batch([
        // Existing contact retention also applies to this private processing path.
        db.prepare('DELETE FROM contact_submissions WHERE server_received_at < ?').bind(cutoff),
        db.prepare("UPDATE contact_mail_outbox SET state='pending',claim_id=NULL,lease_until=NULL WHERE state='claimed' AND lease_until < ?").bind(now),
        db.prepare("UPDATE contact_mail_outbox SET state='unknown',reason='SEND_INTERRUPTED' WHERE state='sending' AND lease_until < ?").bind(now),
        db.prepare(`UPDATE contact_mail_outbox SET state='claimed',claim_id=?,lease_until=?,attempts=attempts+1
          WHERE submission_id=(SELECT submission_id FROM contact_mail_outbox WHERE state='pending' AND next_attempt_at<=? ORDER BY rowid LIMIT 1) RETURNING submission_id`).bind(claimId,now+600_000,now),
      ]),3000,'DB_TIMEOUT');
      const id=(result[3].results?.[0] as {submission_id?:unknown}|undefined)?.submission_id;
      if(!isContactSubmissionId(id))return answer(200,{code:'EMPTY',item:null});
      const item=await deadline(db.prepare('SELECT submission_id,subject,body,reply_email,server_received_at FROM contact_submissions WHERE submission_id=?').bind(id).first<{submission_id:string;subject:string;body:string;reply_email:string|null;server_received_at:string}>(),3000,'DB_TIMEOUT');
      const content=item?[item.subject,item.body,item.reply_email].join('\n'):'';
      if(!item||containsContactSecret(content)||content.includes(secret)){
        await deadline(db.prepare("UPDATE contact_mail_outbox SET state='blocked',reason='CONTENT_CHECK' WHERE submission_id=? AND claim_id=?").bind(id,claimId).run(),3000,'DB_TIMEOUT');
        return answer(200,{code:'BLOCKED',item:null});
      }
      return answer(200,{code:'CLAIMED',item:{submission_id:item.submission_id,subject:item.subject,body:item.body,reply_email:item.reply_email,server_received_at:item.server_received_at,claimId}});
    }
    if(!('id' in data))return answer(400,{code:'INVALID'});
    let sql:string;let values:unknown[];
    if(data.action==='start'){
      if(!config.enabled)return answer(409,{code:'PAUSED'});
      sql="UPDATE contact_mail_outbox SET state='sending',lease_until=? WHERE submission_id=? AND claim_id=? AND state='claimed' AND lease_until>=?";
      values=[now+600_000,data.id,data.claimId,now];
    }else if(data.action==='ack'){
      sql="UPDATE contact_mail_outbox SET state='sent',sent_at=COALESCE(sent_at,?),reason=NULL WHERE submission_id=? AND claim_id=? AND state IN ('sending','unknown','sent')";
      values=[now,data.id,data.claimId];
    }else if(data.action==='unknown'){
      sql="UPDATE contact_mail_outbox SET state='unknown',reason='SEND_UNCERTAIN' WHERE submission_id=? AND claim_id=? AND state IN ('sending','unknown')";
      values=[data.id,data.claimId];
    }else{
      sql="UPDATE contact_mail_outbox SET state='pending',claim_id=NULL,lease_until=NULL,next_attempt_at=? WHERE submission_id=? AND claim_id=? AND state='claimed'";
      values=[now+3_600_000,data.id,data.claimId];
    }
    const updated=await deadline(db.prepare(sql).bind(...values).run(),3000,'DB_TIMEOUT');
    if(updated.meta.changes===1)return answer(200,{code:'OK'});
    const exists=await deadline(db.prepare('SELECT 1 AS present FROM contact_mail_outbox WHERE submission_id=?').bind(data.id).first(),3000,'DB_TIMEOUT');
    return answer(exists?409:410,{code:exists?'STATE_CONFLICT':'EXPIRED'});
  }catch(error){return error instanceof BoundaryError?answer(error.status,{code:error.code}):answer(503,{code:'UNAVAILABLE'});}
}
