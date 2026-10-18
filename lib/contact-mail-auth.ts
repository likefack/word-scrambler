/** Server-only protocol. Secrets never belong in client components or logs. */
export const CONTACT_MAIL_PATH = '/api/contact-mail';
export const CONTACT_MAIL_MAX_BYTES = 2048;
export async function verifyContactMailSignature(request: Request, body: string, secret: string, now: number) {
  const timestamp = request.headers.get('x-contact-timestamp') || '';
  const nonce = request.headers.get('x-contact-nonce') || '';
  const signature = request.headers.get('x-contact-signature') || '';
  if (secret.length < 32 || !/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 120_000 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(signature)) return null;
  if (request.method !== 'POST' || new URL(request.url).pathname !== CONTACT_MAIL_PATH || new URL(request.url).search) return null;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(signature.match(/../g)!, pair => parseInt(pair, 16));
  const valid = await crypto.subtle.verify('HMAC', key, bytes, encoder.encode(`POST\n${CONTACT_MAIL_PATH}\n${timestamp}\n${nonce}\n${body}`));
  return valid ? nonce : null;
}

export type ContactMailEnvironment = {
  CONTACT_MAIL_HMAC_SECRET?: string;
  CONTACT_MAIL_ENABLED?: string;
  CONTACT_MAIL_CUTOVER_AT?: string;
};
/** Values are server-owned. No client field can activate or alter cutover. */
export function contactMailConfiguration(environment:ContactMailEnvironment){
  const cutover=environment.CONTACT_MAIL_CUTOVER_AT;
  const validDate=typeof cutover==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cutover)&&Number.isFinite(Date.parse(cutover))&&new Date(cutover).toISOString()===cutover;
  return {enabled:environment.CONTACT_MAIL_ENABLED==='true'&&typeof environment.CONTACT_MAIL_HMAC_SECRET==='string'&&environment.CONTACT_MAIL_HMAC_SECRET.length>=32&&validDate,cutoverAt:validDate?cutover:null};
}
