export const config = { runtime: 'edge' };

const SB_URL = 'https://yjghsymqopqfezwdjhki.supabase.co';

const sbFetch = (path, method = 'GET', data = null, token = null) =>
  fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_KEY,
      'Authorization': `Bearer ${token || process.env.SUPABASE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: data ? JSON.stringify(data) : null,
  });

const H = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Upload base64 image to Supabase Storage, return public URL
async function uploadSignature(base64Data, agreementId) {
  try {
    // Strip data: prefix to get pure base64
    const b64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const filename = `signatures/${agreementId}.png`;
    const uploadRes = await fetch(`${SB_URL}/storage/v1/object/agreements/${filename}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'image/png',
        'apikey': process.env.SUPABASE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
        'x-upsert': 'true',
      },
      body: bytes,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      console.error('Storage upload failed:', err.substring(0, 200));
      return null;
    }

    // Return public URL
    return `${SB_URL}/storage/v1/object/public/agreements/${filename}`;
  } catch (e) {
    console.error('Signature upload error:', e.message);
    return null;
  }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: H });

  try {
    const body = await req.json();
    const { action } = body;

    // ── CREATE ──
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
      if (agreement.bizLogo && agreement.bizLogo.length < 400000) {
        insertData.biz_logo = agreement.bizLogo;
      }

      const res = await sbFetch('agreements', 'POST', insertData, userToken);
      const resText = await res.text();
      if (!res.ok) {
        console.error('Insert failed:', resText.substring(0, 200));
        return new Response(JSON.stringify({ error: 'Failed to save agreement. Please try again.' }), { status: 400, headers: H });
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
              subject: `✍️ ${agreement.title} — Please Sign`,
              html: buildSigningEmail(agreement, signingUrl),
            }),
          });
          emailSent = er.ok;
          if (!er.ok) { const ed = await er.json(); console.error('Email err:', JSON.stringify(ed)); }
        } catch (e) { console.error('Email error:', e.message); }
      }

      return new Response(JSON.stringify({ success: true, id, signingToken, signingUrl, emailSent }), { headers: H });
    }

    // ── GET ──
    if (action === 'get') {
      const { token } = body;
      if (!token) return new Response(JSON.stringify({ error: 'Token required' }), { status: 400, headers: H });
      const res = await sbFetch(`agreements?signing_token=eq.${encodeURIComponent(token)}&select=*`);
      const data = await res.json();
      if (!Array.isArray(data) || !data.length)
        return new Response(JSON.stringify({ error: 'Agreement not found or link expired' }), { status: 404, headers: H });
      return new Response(JSON.stringify({ agreement: data[0] }), { headers: H });
    }

    // ── SIGN ──
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

      // Upload signature to Supabase Storage to get a proper URL for email
      let signatureUrl = null;
      if (signatureData && signatureData.startsWith('data:image')) {
        signatureUrl = await uploadSignature(signatureData, agr.id);
      }

      const updateData = {
        status: 'signed',
        signed_at: signedAt,
        signed_name: signedName,
        // Store base64 for in-app display (capped at 200KB)
        signature_data: signatureData ? signatureData.substring(0, 200000) : '',
      };

      const updateRes = await sbFetch(`agreements?id=eq.${agr.id}`, 'PATCH', updateData);
      if (!updateRes.ok) {
        const errText = await updateRes.text();
        console.error('PATCH failed:', errText.substring(0, 200));
        return new Response(JSON.stringify({ error: 'Failed to save signature. Please try again.' }), { status: 500, headers: H });
      }

      // Send confirmation email with proper signature URL
      let confirmEmailSent = false;
      if (process.env.RESEND_KEY && agr.client_email) {
        try {
          const er = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_KEY}` },
            body: JSON.stringify({
              from: `${agr.biz_name} <onboarding@resend.dev>`,
              to: [agr.client_email],
              subject: `✅ Signed: ${agr.title} — Your Signed Copy`,
              html: buildConfirmEmail(agr, signedName, signedAt, signatureUrl, signatureData),
            }),
          });
          confirmEmailSent = er.ok;
          if (!er.ok) { const ed = await er.json(); console.error('Confirm email err:', JSON.stringify(ed)); }
        } catch (e) { console.error('Confirm email error:', e.message); }
      }

      return new Response(JSON.stringify({ success: true, signedAt, confirmEmailSent }), { headers: H });
    }

    // ── LIST ──
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
<body style="margin:0;padding:0;background:#F0F3FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:580px;margin:0 auto;padding:24px 16px">
  <div style="background:#0F1130;border-radius:14px 14px 0 0;padding:28px 32px">
    <div style="font-size:20px;font-weight:900;color:white">${agr.bizName||agr.biz_name||''}</div>
    <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:3px">${agr.bizAddr||agr.biz_addr||''} ${agr.bizPhone||agr.biz_phone?'&middot; '+(agr.bizPhone||agr.biz_phone):''}</div>
  </div>
  <div style="background:white;padding:32px;border:1px solid #E0E4FF;border-top:none">
    <p style="font-size:15px;font-weight:800;color:#0F1130;margin:0 0 8px">&#x1F4CB; ${agr.title}</p>
    <p style="font-size:13px;color:#5B6080;line-height:1.7;margin:0 0 24px">
      Dear <strong>${agr.clientName||agr.client_name}</strong>,<br/><br/>
      <strong>${agr.bizName||agr.biz_name}</strong> has sent you an agreement that needs your electronic signature. 
      Please review it carefully and sign — it only takes a minute.
    </p>
    ${(f.service||f.start)?`<div style="background:#F5F6FF;border-radius:10px;padding:14px;margin-bottom:24px;border:1px solid #E0E4FF;font-size:13px">
      ${f.service?`<div style="margin-bottom:6px"><strong>Service:</strong> ${f.service}</div>`:''}
      ${f.start?`<div style="margin-bottom:6px"><strong>Date:</strong> ${f.start}${f.end?' &rarr; '+f.end:''}</div>`:''}
      ${f.pickup?`<div><strong>Pick-up:</strong> ${f.pickup}</div>`:''}
    </div>`:''}
    <div style="text-align:center;margin:28px 0">
      <a href="${signingUrl}" style="display:inline-block;background:linear-gradient(135deg,#00C896,#009970);color:white;text-decoration:none;padding:16px 44px;border-radius:100px;font-size:15px;font-weight:800">
        &#x270D;&#xFE0F; Review &amp; Sign Agreement
      </a>
    </div>
    <p style="font-size:11px;color:#9DA0BC;text-align:center;margin-bottom:6px">Or copy this link:</p>
    <div style="background:#F5F6FF;border-radius:8px;padding:10px 14px;font-size:11px;color:#818CF8;word-break:break-all;text-align:center;border:1px solid #E0E4FF">${signingUrl}</div>
    <p style="font-size:11px;color:#9DA0BC;margin-top:20px;line-height:1.6;text-align:center">
      After you sign, you will immediately receive a full copy of the signed agreement by email, including your signature.
    </p>
  </div>
  <div style="background:#F5F6FF;border-radius:0 0 14px 14px;padding:14px;text-align:center;border:1px solid #E0E4FF;border-top:none">
    <span style="font-size:11px;color:#9DA0BC">Secure e-signatures by <strong>Hisab-Kitab</strong></span>
  </div>
</div></body></html>`;
}

function buildConfirmEmail(agr, signedName, signedAt, signatureUrl, signatureDataB64) {
  const signedDate = new Date(signedAt).toLocaleString('en-AU', { dateStyle: 'full', timeStyle: 'short' });
  const terms = Array.isArray(agr.terms) ? agr.terms : [];
  const f = agr.fields || {};
  // Use uploaded URL if available, otherwise fall back to base64 (works in some clients)
  const sigImgSrc = signatureUrl || (signatureDataB64||'');
  const hasSig = !!sigImgSrc;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#F0F3FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:580px;margin:0 auto;padding:24px 16px">
  <div style="background:#0F1130;border-radius:14px 14px 0 0;padding:28px 32px">
    <div style="font-size:20px;font-weight:900;color:white">${agr.biz_name}</div>
    <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:3px">${agr.biz_addr||''} ${agr.biz_phone?'&middot; '+agr.biz_phone:''}</div>
  </div>
  <div style="background:white;padding:32px;border:1px solid #E0E4FF;border-top:none">

    <div style="background:rgba(0,200,150,.08);border:1px solid rgba(0,200,150,.25);border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
      <div style="font-size:36px;margin-bottom:8px">&#x2705;</div>
      <div style="font-size:18px;font-weight:900;color:#009970">Agreement Signed</div>
      <div style="font-size:13px;color:#5B6080;margin-top:6px">Signed by <strong>${signedName}</strong></div>
      <div style="font-size:12px;color:#9DA0BC;margin-top:3px">${signedDate}</div>
    </div>

    <p style="font-size:13px;color:#5B6080;line-height:1.7;margin:0 0 20px">
      Dear <strong>${agr.client_name}</strong>,<br/><br/>
      This email is your official confirmation and signed copy of the <strong>${agr.title}</strong> with <strong>${agr.biz_name}</strong>. Please keep it for your records.
    </p>

    ${hasSig?`<div style="background:#F9FAFB;border-radius:10px;padding:20px;border:1px solid #E5E7EB;margin-bottom:24px;text-align:center">
      <div style="font-size:11px;font-weight:800;color:#9CA3AF;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px">Your Signature</div>
      <img src="${sigImgSrc}" width="240" height="80" style="max-width:240px;max-height:80px;display:block;margin:0 auto;border-bottom:2px solid #374151;object-fit:contain" alt="Your signature"/>
      <div style="font-size:13px;color:#374151;font-weight:700;margin-top:8px">${signedName}</div>
      <div style="font-size:11px;color:#9CA3AF;margin-top:3px">${signedDate}</div>
    </div>`:`<div style="background:#F9FAFB;border-radius:10px;padding:16px;border:1px solid #E5E7EB;margin-bottom:24px;text-align:center">
      <div style="font-size:11px;font-weight:800;color:#9CA3AF;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Signed by</div>
      <div style="font-size:16px;font-weight:800;color:#374151;border-bottom:2px solid #374151;display:inline-block;padding-bottom:4px;min-width:200px">${signedName}</div>
      <div style="font-size:11px;color:#9CA3AF;margin-top:6px">${signedDate}</div>
    </div>`}

    <!-- FULL AGREEMENT COPY -->
    <div style="border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;margin-bottom:20px">
      <div style="background:#0F1130;padding:16px 20px">
        <div style="font-size:15px;font-weight:900;color:white">${agr.title}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:3px">${agr.biz_name} &middot; ${new Date(agr.created_at||signedAt).toLocaleDateString()}</div>
      </div>
      <div style="padding:20px">
        <div style="font-size:10px;font-weight:800;color:#9CA3AF;text-transform:uppercase;letter-spacing:.07em;margin-bottom:14px">Terms &amp; Conditions</div>
        ${terms.map((t,i)=>`<div style="display:flex;gap:10px;margin-bottom:12px"><div style="width:20px;height:20px;background:#F3F4F6;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#9CA3AF;flex-shrink:0;margin-top:2px">${i+1}</div><div style="font-size:12px;color:#374151;line-height:1.7">${t}</div></div>`).join('')}

        ${Object.values(f).some(Boolean)?`<div style="margin-top:16px;padding-top:14px;border-top:1px solid #E5E7EB">
          <div style="font-size:10px;font-weight:800;color:#9CA3AF;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px">Booking Details</div>
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            ${f.service?`<tr><td style="padding:7px 0;border-bottom:1px solid #F3F4F6;color:#6B7280;width:40%">Service</td><td style="padding:7px 0;border-bottom:1px solid #F3F4F6;font-weight:600;color:#374151">${f.service}</td></tr>`:''}
            ${f.rego?`<tr><td style="padding:7px 0;border-bottom:1px solid #F3F4F6;color:#6B7280">Ref / Rego</td><td style="padding:7px 0;border-bottom:1px solid #F3F4F6;font-weight:600;color:#374151">${f.rego}</td></tr>`:''}
            ${f.start?`<tr><td style="padding:7px 0;border-bottom:1px solid #F3F4F6;color:#6B7280">Dates</td><td style="padding:7px 0;border-bottom:1px solid #F3F4F6;font-weight:600;color:#374151">${f.start}${f.end?' &rarr; '+f.end:''}</td></tr>`:''}
            ${f.pickup?`<tr><td style="padding:7px 0;border-bottom:1px solid #F3F4F6;color:#6B7280">Pick-up</td><td style="padding:7px 0;border-bottom:1px solid #F3F4F6;font-weight:600;color:#374151">${f.pickup}</td></tr>`:''}
            ${f.dropoff?`<tr><td style="padding:7px 0;border-bottom:1px solid #F3F4F6;color:#6B7280">Return</td><td style="padding:7px 0;border-bottom:1px solid #F3F4F6;font-weight:600;color:#374151">${f.dropoff}</td></tr>`:''}
            ${f.depPaid?`<tr><td style="padding:7px 0;border-bottom:1px solid #F3F4F6;color:#6B7280">Deposit Paid</td><td style="padding:7px 0;border-bottom:1px solid #F3F4F6;font-weight:700;color:#009970">${f.depPaid}</td></tr>`:''}
            ${f.balance?`<tr><td style="padding:7px 0;border-bottom:1px solid #F3F4F6;color:#6B7280">Balance Due</td><td style="padding:7px 0;border-bottom:1px solid #F3F4F6;font-weight:700;color:#FF5C7A">${f.balance}</td></tr>`:''}
            ${f.clientName?`<tr><td style="padding:7px 0;border-bottom:1px solid #F3F4F6;color:#6B7280">Client</td><td style="padding:7px 0;border-bottom:1px solid #F3F4F6;font-weight:600;color:#374151">${f.clientName}</td></tr>`:''}
            ${f.licence?`<tr><td style="padding:7px 0;color:#6B7280">Licence / ID</td><td style="padding:7px 0;font-weight:600;color:#374151">${f.licence}</td></tr>`:''}
          </table>
        </div>`:''}

        <!-- Signatures -->
        <div style="margin-top:16px;padding-top:14px;border-top:2px solid #E5E7EB;display:flex;justify-content:space-between;align-items:flex-end">
          <div>
            <div style="font-size:10px;font-weight:800;color:#9CA3AF;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Client Signature</div>
            ${hasSig?`<img src="${sigImgSrc}" width="140" height="48" style="max-width:140px;max-height:48px;display:block;border-bottom:1.5px solid #374151;object-fit:contain" alt="signature"/>`:`<div style="width:140px;border-bottom:1.5px solid #374151;padding-bottom:6px;font-size:13px;font-weight:700;color:#374151">${signedName}</div>`}
            <div style="font-size:10px;color:#9CA3AF;margin-top:4px">${signedName}</div>
            <div style="font-size:10px;color:#9CA3AF">${signedDate}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:10px;font-weight:800;color:#9CA3AF;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Authorised by</div>
            <div style="font-size:13px;font-weight:700;color:#374151">${agr.biz_name}</div>
            ${agr.biz_phone?`<div style="font-size:11px;color:#9CA3AF;margin-top:2px">${agr.biz_phone}</div>`:''}
          </div>
        </div>
      </div>
    </div>

    <p style="font-size:11px;color:#9CA3AF;line-height:1.6;text-align:center">
      Keep this email as your official signed record. Questions? Contact <strong>${agr.biz_name}</strong>${agr.biz_phone?' on '+agr.biz_phone:''}.
    </p>
  </div>
  <div style="background:#F5F6FF;border-radius:0 0 14px 14px;padding:14px;text-align:center;border:1px solid #E0E4FF;border-top:none">
    <span style="font-size:11px;color:#9DA0BC">Signed via <strong>Hisab-Kitab</strong> &middot; ${signedDate}</span>
  </div>
</div></body></html>`;
}
