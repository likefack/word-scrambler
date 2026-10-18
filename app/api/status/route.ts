import { getChatGPTUser } from '../../chatgpt-auth';
import { getOwnerGroqApiKey } from '../../../lib/server-groq';

export const dynamic = 'force-dynamic';
export async function GET() {
  const user = await getChatGPTUser();
  return Response.json({ownerKeyAvailable: Boolean(user && getOwnerGroqApiKey())}, {
    status: user ? 200 : 401,
    headers: {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},
  });
}
