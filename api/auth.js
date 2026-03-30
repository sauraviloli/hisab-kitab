export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://yjghsymqopqfezwdjhki.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;

export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers });

  try {
    const { action, email, password, bizName } = await req.json();

    if (action === 'signup') {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.error) return new Response(JSON.stringify({ error: data.error.message || data.error }), { status: 400, headers });
      // Save biz name to profile
      if (data.user && bizName) {
        await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify({ id: data.user.id, email, biz_name: bizName })
        });
      }
      return new Response(JSON.stringify({ user: data.user, session: data.session || data }), { headers });
    }

    if (action === 'login') {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.error) return new Response(JSON.stringify({ error: data.error.message || data.error }), { status: 400, headers });
      return new Response(JSON.stringify({ user: data.user, access_token: data.access_token, refresh_token: data.refresh_token }), { headers });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers });
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
