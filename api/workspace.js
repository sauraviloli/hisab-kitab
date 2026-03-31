export const config = { runtime: 'edge' };

const SB_URL = 'https://yjghsymqopqfezwdjhki.supabase.co';
const SB_KEY = () => process.env.SUPABASE_KEY; // service role key

export default async function handler(req) {
  const h = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });

  try {
    const body = await req.text();
    const { action, name, userId, code } = JSON.parse(body);

    const sbReq = (path, method = 'GET', data = null) => fetch(`${SB_URL}/rest/v1/${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': SB_KEY(),
        'Authorization': `Bearer ${SB_KEY()}`,
        'Prefer': method === 'POST' ? 'return=representation' : '',
      },
      body: data ? JSON.stringify(data) : null,
    });

    if (action === 'create') {
      // Create workspace
      const wsRes = await sbReq('workspaces', 'POST', { name, created_by: userId });
      const wsData = await wsRes.json();
      if (!wsRes.ok) return new Response(JSON.stringify({ error: wsData.message || 'Failed to create workspace' }), { status: 400, headers: h });
      const ws = Array.isArray(wsData) ? wsData[0] : wsData;

      // Add creator as owner member
      await sbReq('workspace_members', 'POST', { workspace_id: ws.id, user_id: userId, role: 'owner' });

      // Create invite code
      const invRes = await sbReq('workspace_invites', 'POST', { workspace_id: ws.id, created_by: userId });
      const invData = await invRes.json();
      const inv = Array.isArray(invData) ? invData[0] : invData;

      return new Response(JSON.stringify({ workspaceId: ws.id, inviteCode: inv?.invite_code || 'N/A' }), { headers: h });
    }

    if (action === 'join') {
      // Find invite
      const invRes = await sbReq(`workspace_invites?invite_code=eq.${code.toLowerCase()}&select=*`);
      const invData = await invRes.json();
      if (!invData?.length) return new Response(JSON.stringify({ error: 'Invalid or expired invite code' }), { status: 400, headers: h });
      const inv = invData[0];

      // Add user as partner member
      await sbReq('workspace_members', 'POST', { workspace_id: inv.workspace_id, user_id: userId, role: 'partner' });

      return new Response(JSON.stringify({ workspaceId: inv.workspace_id }), { headers: h });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: h });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: h });
  }
}
