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

export default async function handler(req) {
  const h = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });

  try {
    const body = await req.json();
    const { action } = body;

    // ── CREATE & SEND ──
    if (action === 'create') {
      const { agreement, userToken } = body;
      const signingToken = crypto.randomUUID().replace(/-/g, '');
      const id = 'agr-' + Date.now();

      const res = await sbFetch('agreements', 'POST', {
        id,
        deposit_id: agreement.depositId || null,
        user_id: agreement.userId,
        biz_name: agreement.bizName,
        biz_addr: agreement.bizAddr || '',
        biz_phone: agreement.bizPhone || '',
        biz_logo: agreement.bizLogo || null,
        title: agreement.title,
        terms: agreement.terms,
        fields: agreement.fields,
        client_name: agreement.clientName,
        client_email: agreement.clientEmail,
        signing_token: signingToken,
        status: 'pending',
      }, userToken);

      if (!res.ok) {
        const err = await res.json();
        return new Response(JSON.stringify({ error: err.message || 'Failed to save' }), { status: 400, headers: h });
      }

      const appUrl = process.env.APP_URL || 'https://hisab-kitab-sigma.vercel.app';
      const signingUrl = `${appUrl}/sign.html?token=${signingToken}`;

      // Send email if Resend configured
      let emailSent = false;
      if (process.env.RESEND_KEY && agreement.clientEmail) {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.RESEND_KEY}`,
          },
          body: JSON.stringify({
            from: `${agreement.bizName} <onboarding@resend.dev>`,
            to: [agreement.clientEmail],
            subject: `✍️ ${agreement.title} — Signature Required`,
            html: buildSigningEmail(agreement, signingUrl),
          }),
        });
        emailSent = emailRes.ok;
      }

      return new Response(JSON.stringify({ success: true, id, signingToken, signingUrl, emailSent }), { headers: h });
    }

    // ── GET BY TOKEN (signing page loads this) ──
    if (action === 'get') {
      const { token } = body;
      const res = await sbFetch(`agreements?signing_token=eq.${encodeURIComponent(token)}&select=*`);
      const data = await res.json();
      if (!Array.isArray(data) || !data.length)
        return new Response(JSON.stringify({ error: 'Agreement not found' }), { status: 404, headers: h });
      return new Response(JSON.stringify({ agreement: data[0] }), { headers: h });
    }

    // ── SIGN ──
    if (action === 'sign') {
      const { token, signedName, signatureData } = body;

      // Get agreement
      const getRes = await sbFetch(`agreements?signing_token=eq.${encodeURIComponent(token)}&select=*`);
      const getData = await getRes.json();
      if (!Array.isArray(getData) || !getData.length)
        return new Response(JSON.stringify({ error: 'Agreement not found' }), { status: 404, headers: h });

      const agr = getData[0];
      if (agr.status === 'signed')
        return new Response(JSON.stringify({ error: 'Already signed' }), { status: 400, headers: h });

      const signedAt = new Date().toISOString();

      // Update record
      await sbFetch(`agreements?id=eq.${agr.id}`, 'PATCH', {
        status: 'signed',
        signed_at: signedAt,
        signed_name: signedName,
        signature_data: signatureData || '',
      });

      // Send confirmation email to client
      if (process.env.RESEND_KEY && agr.client_email) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.RESEND_KEY}`,
          },
          body: JSON.stringify({
            from: `${agr.biz_name} <onboarding@resend.dev>`,
            to: [agr.client_email],
            subject: `✅ Signed: ${agr.title} — ${agr.biz_name}`,
            html: buildConfirmEmail(agr, signedName, signedAt, signatureData),
          }),
        });
      }

      return new Response(JSON.stringify({ success: true, signedAt }), { headers: h });
    }

    // ── LIST FOR USER ──
    if (action === 'list') {
      const { userId, userToken } = body;
      const res = await sbFetch(
        `agreements?user_id=eq.${userId}&order=created_at.desc&select=id,title,client_name,client_email,status,signed_at,signed_name,signature_data,deposit_id,created_at`,
        'GET', null, userToken
      );
      const data = await res.json();
      return new Response(JSON.stringify({ agreements: data || [] }), { headers: h });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: h });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: h });
  }
}

function buildSigningEmail(agr, signingUrl) {
  const fields = agr.fields || {};
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#F0F3FF;font-family:-apple-system,sans-serif">
<div style="max-width:580px;margin:0 auto;padding:24px 16px">
  <div style="background:#0F1130;border-radius:14px 14px 0 0;padding:28px 32px">
    ${agr.biz_logo ? `<img src="${agr.biz_logo}" style="width:48px;height:48px;border-radius:8px;object-fit:contain;background:white;padding:3px;margin-bottom:10px;display:block"/>` : ''}
    <div style="font-size:20px;font-weight:900;color:white">${agr.biz_name}</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:3px">${agr.biz_addr || ''}</div>
  </div>
  <div style="background:white;padding:32px;border:1px solid #E0E4FF;border-top:none">
    <p style="font-size:15px;font-weight:800;color:#0F1130;margin-bottom:4px">📋 ${agr.title}</p>
    <p style="font-size:13px;color:#5B6080;line-height:1.7;margin-bottom:24px">
      Dear <strong>${agr.client_name}</strong>,<br/><br/>
      <strong>${agr.biz_name}</strong> has prepared an agreement for you.
      Please review the full terms and sign electronically — it takes less than a minute.
    </p>
    ${fields.service || fields.start ? `
    <div style="background:#F5F6FF;border-radius:10px;padding:14px 18px;margin-bottom:24px;border:1px solid #E0E4FF">
      <div style="font-size:10px;font-weight:800;color:#9DA0BC;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">Booking Details</div>
      ${fields.service ? `<div style="margin-bottom:6px;font-size:13px"><span style="color:#9DA0BC;font-weight:600">Service:</span> <span style="color:#0F1130;font-weight:500">${fields.service}</span></div>` : ''}
      ${fields.start ? `<div style="margin-bottom:6px;font-size:13px"><span style="color:#9DA0BC;font-weight:600">Date:</span> <span style="color:#0F1130;font-weight:500">${fields.start}${fields.end ? ' → ' + fields.end : ''}</span></div>` : ''}
      ${fields.pickup ? `<div style="font-size:13px"><span style="color:#9DA0BC;font-weight:600">Pick-up:</span> <span style="color:#0F1130;font-weight:500">${fields.pickup}</span></div>` : ''}
    </div>` : ''}
    <div style="text-align:center;margin:28px 0">
      <a href="${signingUrl}" style="display:inline-block;background:linear-gradient(135deg,#00C896,#009970);color:white;text-decoration:none;padding:16px 44px;border-radius:100px;font-size:15px;font-weight:800;box-shadow:0 4px 16px rgba(0,200,150,.3)">
        ✍️ Review &amp; Sign Agreement
      </a>
    </div>
    <p style="font-size:11px;color:#9DA0BC;text-align:center">
      Or copy this link into your browser:<br/>
      <span style="color:#818CF8;word-break:break-all">${signingUrl}</span>
    </p>
    <hr style="border:none;border-top:1px solid #F0F3FF;margin:24px 0"/>
    <p style="font-size:11px;color:#9DA0BC;line-height:1.6">
      Your electronic signature is legally binding and will be timestamped. After signing, you will receive a copy of the signed agreement by email. If you did not expect this, please ignore.
    </p>
  </div>
  <div style="background:#F5F6FF;border-radius:0 0 14px 14px;padding:14px 32px;text-align:center;border:1px solid #E0E4FF;border-top:none">
    <span style="font-size:11px;color:#9DA0BC">Powered by <strong>Hisab-Kitab</strong> · Secure E-Signatures</span>
  </div>
</div>
</body></html>`;
}

function buildConfirmEmail(agr, signedName, signedAt, sigData) {
  const signedDate = new Date(signedAt).toLocaleString();
  const terms = Array.isArray(agr.terms) ? agr.terms : [];
  const fields = agr.fields || {};
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#F0F3FF;font-family:-apple-system,sans-serif">
<div style="max-width:580px;margin:0 auto;padding:24px 16px">
  <div style="background:#0F1130;border-radius:14px 14px 0 0;padding:28px 32px">
    ${agr.biz_logo ? `<img src="${agr.biz_logo}" style="width:48px;height:48px;border-radius:8px;object-fit:contain;background:white;padding:3px;margin-bottom:10px;display:block"/>` : ''}
    <div style="font-size:20px;font-weight:900;color:white">${agr.biz_name}</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:3px">${agr.biz_addr || ''}</div>
  </div>
  <div style="background:white;padding:32px;border:1px solid #E0E4FF;border-top:none">
    <div style="background:rgba(0,200,150,.08);border:1px solid rgba(0,200,150,.25);border-radius:10px;padding:14px 18px;margin-bottom:24px;text-align:center">
      <div style="font-size:22px;margin-bottom:4px">✅</div>
      <div style="font-size:15px;font-weight:800;color:#009970">Agreement Signed Successfully</div>
      <div style="font-size:12px;color:#5B6080;margin-top:4px">Signed by <strong>${signedName}</strong> on ${signedDate}</div>
    </div>
    <p style="font-size:13px;color:#5B6080;line-height:1.7;margin-bottom:24px">
      Dear <strong>${agr.client_name}</strong>,<br/><br/>
      Thank you for signing the <strong>${agr.title}</strong>. This email is your confirmation and record of the signed agreement.
    </p>
    ${sigData && sigData.startsWith('data:image') ? `
    <div style="margin-bottom:24px;padding:16px;background:#F9FAFB;border-radius:10px;border:1px solid #E5E7EB;text-align:center">
      <div style="font-size:10px;font-weight:800;color:#9DA0BC;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">Your Signature</div>
      <img src="${sigData}" style="max-width:240px;max-height:80px;border-bottom:2px solid #374151"/>
      <div style="font-size:11px;color:#9DA0BC;margin-top:6px">${signedName}</div>
    </div>` : ''}
    <!-- Agreement copy -->
    <div style="background:#F9FAFB;border-radius:10px;border:1px solid #E5E7EB;overflow:hidden;margin-bottom:24px">
      <div style="background:#0F1130;padding:14px 18px">
        <div style="font-size:14px;font-weight:800;color:white">${agr.title}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:2px">${agr.biz_name}</div>
      </div>
      <div style="padding:18px">
        <div style="font-size:10px;font-weight:800;color:#9DA0BC;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">Terms & Conditions</div>
        ${terms.map((t, i) => `<p style="font-size:12px;color:#374151;margin-bottom:8px;line-height:1.6"><strong>${i + 1}.</strong> ${t}</p>`).join('')}
        ${Object.keys(fields).length ? `
        <div style="margin-top:16px;padding-top:12px;border-top:1px solid #E5E7EB">
          <div style="font-size:10px;font-weight:800;color:#9DA0BC;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">Booking Details</div>
          ${fields.service ? `<div style="font-size:12px;color:#374151;margin-bottom:5px"><strong>Service:</strong> ${fields.service}</div>` : ''}
          ${fields.start ? `<div style="font-size:12px;color:#374151;margin-bottom:5px"><strong>Start:</strong> ${fields.start}${fields.end ? ' → ' + fields.end : ''}</div>` : ''}
          ${fields.pickup ? `<div style="font-size:12px;color:#374151;margin-bottom:5px"><strong>Pick-up:</strong> ${fields.pickup}</div>` : ''}
          ${fields.dropoff ? `<div style="font-size:12px;color:#374151;margin-bottom:5px"><strong>Return:</strong> ${fields.dropoff}</div>` : ''}
          ${fields.clientName ? `<div style="font-size:12px;color:#374151;margin-bottom:5px"><strong>Client:</strong> ${fields.clientName}</div>` : ''}
          ${fields.licence ? `<div style="font-size:12px;color:#374151;margin-bottom:5px"><strong>Licence:</strong> ${fields.licence}</div>` : ''}
        </div>` : ''}
        <div style="margin-top:16px;padding-top:12px;border-top:1px solid #E5E7EB;display:flex;justify-content:space-between">
          <div>
            <div style="font-size:10px;color:#9DA0BC;font-weight:700;margin-bottom:6px">CLIENT SIGNATURE</div>
            ${sigData && sigData.startsWith('data:image') ? `<img src="${sigData}" style="max-width:140px;max-height:50px;border-bottom:1.5px solid #374151"/>` : `<div style="font-size:12px;color:#374151;font-weight:600">${signedName}</div>`}
            <div style="font-size:10px;color:#9DA0BC;margin-top:4px">${signedName} · ${signedDate}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:10px;color:#9DA0BC;font-weight:700;margin-bottom:6px">AUTHORISED BY</div>
            <div style="font-size:12px;color:#374151;font-weight:600">${agr.biz_name}</div>
            <div style="font-size:10px;color:#9DA0BC;margin-top:4px">${agr.biz_phone || ''}</div>
          </div>
        </div>
      </div>
    </div>
    <p style="font-size:11px;color:#9DA0BC;line-height:1.6">
      Please keep this email as your record. The signed agreement has also been recorded securely.
    </p>
  </div>
  <div style="background:#F5F6FF;border-radius:0 0 14px 14px;padding:14px 32px;text-align:center;border:1px solid #E0E4FF;border-top:none">
    <span style="font-size:11px;color:#9DA0BC">Signed via <strong>Hisab-Kitab</strong> · ${new Date(signedAt).toLocaleString()}</span>
  </div>
</div>
</body></html>`;
}
