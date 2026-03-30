export const config = { runtime: 'edge' };

const SB_URL = 'https://yjghsymqopqfezwdjhki.supabase.co';
const SB_KEY = () => process.env.SUPABASE_KEY;

export default async function handler(req) {
  const h = { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  try {
    const body = await req.text();
    const { action, email, password, bizName, bizType, bizAddr, bizPhone, pan, vat, ownerName, country, currency } = JSON.parse(body);

    if (action === 'signup') {
      const r = await fetch(`${SB_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'apikey':SB_KEY(), 'Authorization':`Bearer ${SB_KEY()}` },
        body: JSON.stringify({ email, password })
      });
      const d = await r.json();
      if (d.error) return new Response(JSON.stringify({ error: d.error.message||d.error }), { status:400, headers:h });
      // Save full profile
      if (d.user) {
        await fetch(`${SB_URL}/rest/v1/profiles`, {
          method: 'POST',
          headers: { 'Content-Type':'application/json','apikey':SB_KEY(),'Authorization':`Bearer ${SB_KEY()}`,'Prefer':'resolution=merge-duplicates' },
          body: JSON.stringify({ id:d.user.id, email, biz_name:bizName, biz_type:bizType, biz_addr:bizAddr, biz_phone:bizPhone, pan, vat_num:vat, owner_name:ownerName, country:country||'NP', currency:currency||'NPR' })
        });
      }
      return new Response(JSON.stringify({ user:d.user, access_token:d.session?.access_token, refresh_token:d.session?.refresh_token }), { headers:h });
    }

    if (action === 'login') {
      const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json','apikey':SB_KEY(),'Authorization':`Bearer ${SB_KEY()}` },
        body: JSON.stringify({ email, password })
      });
      const d = await r.json();
      if (d.error) return new Response(JSON.stringify({ error: d.error.message||d.error }), { status:400, headers:h });
      return new Response(JSON.stringify({ user:d.user, access_token:d.access_token, refresh_token:d.refresh_token }), { headers:h });
    }

    return new Response(JSON.stringify({ error:'Unknown action' }), { status:400, headers:h });
  } catch(e) {
    return new Response(JSON.stringify({ error:e.message }), { status:500, headers:h });
  }
}
