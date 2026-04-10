export const config = { runtime: 'edge' };

const SB_URL = 'https://yjghsymqopqfezwdjhki.supabase.co';

const sbFetch = async (path, method = 'GET', data = null, token = null) => {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_KEY,
      'Authorization': `Bearer ${token || process.env.SUPABASE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: data ? JSON.stringify(data) : null,
  });
};

const H = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: H });

  try {
    const body = await req.json();
    const { action } = body;

    // CREATE
    if (action === 'create') {
      const { agreement, userToken } = body;
      const signingToken = crypto.randomUUID().replace(/-/g, '');
      const id = 'agr-' + Date.now();

      const insertData = {
        id,
        deposit_id: agreement.depositId || null,
        user_id: agreement.userId,
        biz_name: agreement.bizName || '',
        biz_addr: agreement.bizAddr || '',
        biz_phone: agreement.bizPhone || '',
        title: agreement.title || 'Service Agreement',
        terms: agreement.terms || [],
        fields: agreement.fields || {},
        client_name: agreement.clientName || '',
        client_email: agreement.clientEmail || '',
        signing_token: signingToken,
        status: 'pending',
      };

      // Only store logo if small enough
      if (agreement.bizLogo && agreement.bizLogo.length < 400000) {
        insertData.biz_logo = agreement.bizLogo;
      }

      const res = await sbFetch('agreements', 'POST', insertData, userToken);
      const resText = await res.text();
      if (!res.ok) {
        console.error('Insert failed:', resText.substring(0, 300));
        return new Response(JSON.stringify({ error: 'Failed to save: ' + resText.substring(0, 150) }), { status: 400, headers: H });
      }

      const appUrl = process.env.APP_URL || 'https://hisab-kitab-sigma.vercel.app';
      const signingUrl = `${appUrl}/sign.html?token=${signingToken}`;

      let emailSent = false;
      if (process.env.RESEND_KEY && agreement.clientEmail) {
        try {
          const er = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_KEY}` },
            body: JSON.stringify({
              from: `${agreement.bizName} <onboarding@resend.dev>`,
              to: [agreement.clientEmail],
              subject: `\u270D\uFE0F ${agreement.title} \u2014 Please Sign`,
              html: buildSigningEmail(agreement, signingUrl),
            }),
          });
          emailSent = er.ok;
          if (!er.ok) { const ed = await er.json(); console.error('Email err:', JSON.stringify(ed)); }
        } catch (e) { console.error('Email error:', e.message); }
      }

      return new Response(JSON.stringify({ success: true, id, signingToken, signingUrl, emailSent }), { headers: H });
    }

    // GET by token
    if (action === 'get') {
      const { token } = body;
      if (!token) return new Response(JSON.stringify({ error: 'Token required' }), { status: 400, headers: H });
      const res = await sbFetch(`agreements?signing_token=eq.${encodeURIComponent(token)}&select=*`);
      const data = await res.json();
      if (!Array.isArray(data) || !data.length)
        return new Response(JSON.stringify({ error: 'Agreement not found or link expired' }), { status: 404, headers: H });
      return new Response(JSON.stringify({ agreement: data[0] }), { headers: H });
    }

    // SIGN
    if (action === 'sign') {
      const { token, signedName, signatureData } = body;
      if (!token || !signedName)
        return new Response(JSON.stringify({ error: 'Token and name required' }), { status: 400, headers: H });

      const getRes = await sbFetch(`agreements?signing_token=eq.${encodeURIComponent(token)}&select=*`);
      const getData = await getRes.json();
      if (!Array.isArray(getData) || !getData.length)
        return new Response(JSON.stringify({ error: 'Agreement not found' }), { status: 404, headers: H });

      const agr = getData[0];
      if (agr.status === 'signed')
        return new Response(JSON.stringify({ error: 'Already signed', alreadySigned: true }), { status: 400, headers: H });

      const signedAt = new Date().toISOString();

      const updateData = {
        status: 'signed',
        signed_at: signedAt,
        signed_name: signedName,
        signature_data: signatureData ? signatureData.substring(0, 200000) : '',
      };

      const updateRes = await sbFetch(`agreements?id=eq.${agr.id}`, 'PATCH', updateData);
      if (!updateRes.ok) {
        const errText = await updateRes.text();
        console.error('PATCH failed:', errText);
        return new Response(JSON.stringify({ error: 'Failed to save signature. Please try again.' }), { status: 500, headers: H });
      }

      // Send confirmation email to client
      let confirmEmailSent = false;
      if (process.env.RESEND_KEY && agr.client_email) {
        try {
          const er = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_KEY}` },
            body: JSON.stringify({
              from: `${agr.biz_name} <onboarding@resend.dev>`,
              to: [agr.client_email],
              subject: `\u2705 Signed: ${agr.title} \u2014 Your Copy`,
              html: buildConfirmEmail(agr, signedName, signedAt, signatureData),
            }),
          });
          confirmEmailSent = er.ok;
          if (!er.ok) { const ed = await er.json(); console.error('Confirm email err:', JSON.stringify(ed)); }
        } catch (e) { console.error('Confirm email error:', e.message); }
      }

      return new Response(JSON.stringify({ success: true, signedAt, confirmEmailSent }), { headers: H });
    }

    // LIST
    if (action === 'list') {
      const { userId, userToken } = body;
      if (!userId) return new Response(JSON.stringify({ error: 'userId required' }), { status: 400, headers: H });
      const res = await sbFetch(
        `agreements?user_id=eq.${userId}&order=created_at.desc&select=id,title,client_name,client_email,status,signed_at,signed_name,signature_data,deposit_id,created_at`,
        'GET', null, userToken
      );
      const data = await res.json();
      return new Response(JSON.stringify({ agreements: Array.isArray(data) ? data : [] }), { headers: H });
    }

    return new Response(JSON.stringify({ error: 'Unknown action: ' + action }), { status: 400, headers: H });

  } catch (e) {
    console.error('Agreement API error:', e.message);
    return new Response(JSON.stringify({ error: 'Server error: ' + e.message }), { status: 500, headers: H });
  }
}

function buildSigningEmail(agr, signingUrl) {
  const f = agr.fields || {};
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#F0F3FF;font-family:-apple-system,sans-serif">
<div style="max-width:580px;margin:0 auto;padding:24px 16px">
  <div style="background:#0F1130;border-radius:14px 14px 0 0;padding:28px 32px">
    <div style="font-size:20px;font-weight:900;color:white">${agr.bizName||agr.biz_name||''}</div>
    <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:3px">${agr.bizAddr||agr.biz_addr||''}</div>
  </div>
  <div style="background:white;padding:32px;border:1px solid #E0E4FF;border-top:none">
    <p style="font-size:15px;font-weight:800;color:#0F1130;margin-bottom:4px">&#x1F4CB; ${agr.title}</p>
    <p style="font-size:13px;color:#5B6080;line-height:1.7;margin-bottom:24px">
      Dear <strong>${agr.clientName||agr.client_name}</strong>,<br/><br/>
      <strong>${agr.bizName||agr.biz_name}</strong> has sent you an agreement requiring your electronic signature. Click below to review and sign.
    </p>
    ${f.service||f.start?`<div style="background:#F5F6FF;border-radius:10px;padding:14px;margin-bottom:24px;border:1px solid #E0E4FF">
      ${f.service?`<div style="font-size:13px;margin-bottom:6px"><strong>Service:</strong> ${f.service}</div>`:''}
      ${f.start?`<div style="font-size:13px"><strong>Date:</strong> ${f.start}${f.end?' \u2192 '+f.end:''}</div>`:''}
    </div>`:''}
    <div style="text-align:center;margin:28px 0">
      <a href="${signingUrl}" style="display:inline-block;background:linear-gradient(135deg,#00C896,#009970);color:white;text-decoration:none;padding:16px 44px;border-radius:100px;font-size:15px;font-weight:800">
        &#x270D;&#xFE0F; Review &amp; Sign Agreement
      </a>
    </div>
    <p style="font-size:11px;color:#9DA0BC;text-align:center">Or copy: <span style="color:#818CF8;word-break:break-all">${signingUrl}</span></p>
    <p style="font-size:11px;color:#9DA0BC;margin-top:20px;line-height:1.6">After signing, you will immediately receive a signed copy by email with your signature included.</p>
  </div>
  <div style="background:#F5F6FF;border-radius:0 0 14px 14px;padding:14px;text-align:center;border:1px solid #E0E4FF;border-top:none">
    <span style="font-size:11px;color:#9DA0BC">Powered by <strong>Hisab-Kitab</strong></span>
  </div>
</div></body></html>`;
}

function buildConfirmEmail(agr, signedName, signedAt, sigData) {
  const signedDate = new Date(signedAt).toLocaleString('en-AU', { dateStyle: 'full', timeStyle: 'short' });
  const terms = Array.isArray(agr.terms) ? agr.terms : [];
  const f = agr.fields || {};
  const hasSig = sigData && sigData.startsWith('data:image');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#F0F3FF;font-family:-apple-system,sans-serif">
<div style="max-width:580px;margin:0 auto;padding:24px 16px">
  <div style="background:#0F1130;border-radius:14px 14px 0 0;padding:28px 32px">
    <div style="font-size:20px;font-weight:900;color:white">${agr.biz_name||''}</div>
    <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:3px">${agr.biz_addr||''} ${agr.biz_phone?'&middot; '+agr.biz_phone:''}</div>
  </div>
  <div style="background:white;padding:32px;border:1px solid #E0E4FF;border-top:none">
    <div style="background:rgba(0,200,150,.08);border:1px solid rgba(0,200,150,.25);border-radius:12px;padding:20px;text-align:center;margin-bottom:24px">
      <div style="font-size:28px;margin-bottom:8px">&#x2705;</div>
      <div style="font-size:16px;font-weight:900;color:#009970">Agreement Signed</div>
      <div style="font-size:12px;color:#5B6080;margin-top:6px">Signed by <strong>${signedName}</strong><br/>${signedDate}</div>
    </div>
    <p style="font-size:13px;color:#5B6080;line-height:1.7;margin-bottom:20px">
      Dear <strong>${agr.client_name||signedName}</strong>,<br/><br/>
      This email confirms your electronic signature on the <strong>${agr.title}</strong> with <strong>${agr.biz_name}</strong>. Keep this email as your signed record.
    </p>
    ${hasSig?`<div style="background:#F9FAFB;border-radius:10px;padding:16px;border:1px solid #E5E7EB;margin-bottom:20px;text-align:center">
      <div style="font-size:10px;font-weight:800;color:#9CA3AF;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">Your Signature</div>
      <img src="${sigData}" style="max-width:240px;max-height:80px;display:block;margin:0 auto;border-bottom:2px solid #374151"/>
      <div style="font-size:12px;color:#6B7280;margin-top:6px;font-weight:600">${signedName} &middot; ${signedDate}</div>
    </div>`:''}
    <div style="border:1px solid #E5E7EB;border-radius:12px;overflow:hidden">
      <div style="background:#0F1130;padding:16px 20px">
        <div style="font-size:14px;font-weight:800;color:white">${agr.title}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:2px">${agr.biz_name}</div>
      </div>
      <div style="padding:20px">
        <div style="font-size:10px;font-weight:800;color:#9CA3AF;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px">Terms &amp; Conditions</div>
        ${terms.map((t,i)=>`<p style="font-size:12px;color:#374151;margin:0 0 10px;line-height:1.65;padding-left:18px;position:relative"><span style="position:absolute;left:0;color:#9CA3AF;font-weight:700">${i+1}.</span>${t}</p>`).join('')}
        ${Object.values(f).some(Boolean)?`<div style="margin-top:16px;padding-top:14px;border-top:1px solid #E5E7EB">
          <div style="font-size:10px;font-weight:800;color:#9CA3AF;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px">Booking Details</div>
          ${f.service?`<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #F3F4F6;font-size:12px"><span style="color:#6B7280">Service</span><span style="color:#374151;font-weight:600">${f.service}</span></div>`:''}
          ${f.rego?`<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #F3F4F6;font-size:12px"><span style="color:#6B7280">Ref/Rego</span><span style="color:#374151;font-weight:600">${f.rego}</span></div>`:''}
          ${f.start?`<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #F3F4F6;font-size:12px"><span style="color:#6B7280">Dates</span><span style="color:#374151;font-weight:600">${f.start}${f.end?' \u2192 '+f.end:''}</span></div>`:''}
          ${f.pickup?`<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #F3F4F6;font-size:12px"><span style="color:#6B7280">Pick-up</span><span style="color:#374151;font-weight:600">${f.pickup}</span></div>`:''}
          ${f.depPaid?`<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #F3F4F6;font-size:12px"><span style="color:#6B7280">Deposit</span><span style="color:#009970;font-weight:700">${f.depPaid}</span></div>`:''}
          ${f.balance?`<div style="display:flex;justify-content:space-between;padding:7px 0;font-size:12px"><span style="color:#6B7280">Balance Due</span><span style="color:#FF5C7A;font-weight:700">${f.balance}</span></div>`:''}
        </div>`:''}
        <div style="margin-top:16px;padding-top:14px;border-top:2px solid #E5E7EB;display:flex;justify-content:space-between">
          <div>
            <div style="font-size:10px;font-weight:800;color:#9CA3AF;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Client Signature</div>
            ${hasSig?`<img src="${sigData}" style="max-width:140px;max-height:48px;display:block;border-bottom:1.5px solid #374151"/>`:`<div style="width:140px;border-bottom:1.5px solid #374151;padding-bottom:4px;font-size:12px;font-weight:600;color:#374151">${signedName}</div>`}
            <div style="font-size:10px;color:#9CA3AF;margin-top:4px">${signedName} &middot; ${signedDate}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:10px;font-weight:800;color:#9CA3AF;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Authorised by</div>
            <div style="font-size:13px;color:#374151;font-weight:700">${agr.biz_name}</div>
            <div style="font-size:11px;color:#9CA3AF;margin-top:2px">${agr.biz_phone||''}</div>
          </div>
        </div>
      </div>
    </div>
    <p style="font-size:11px;color:#9CA3AF;line-height:1.6;text-align:center;margin-top:20px">Keep this as your official signed record. Questions? Contact ${agr.biz_name}${agr.biz_phone?' on '+agr.biz_phone:''}.</p>
  </div>
  <div style="background:#F5F6FF;border-radius:0 0 14px 14px;padding:14px;text-align:center;border:1px solid #E0E4FF;border-top:none">
    <span style="font-size:11px;color:#9DA0BC">Signed via <strong>Hisab-Kitab</strong> &middot; ${signedDate}</span>
  </div>
</div></body></html>`;
}
