/**
 * api/gmb-setup.js
 * GET /api/gmb-setup
 *
 * Lista las ubicaciones de Google My Business usando el refresh token
 * configurado en Vercel. Visita esta URL en el navegador para obtener
 * el GMB_LOCATION_NAME que debes agregar como env var.
 */
const { google } = require('googleapis');

module.exports = async function handler(req, res) {
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return res.status(500).send(page('Error', '<p style="color:#f87171">Faltan variables de entorno: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o GOOGLE_REFRESH_TOKEN</p>'));
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });

  try {
    const { token } = await auth.getAccessToken();
    const hdrs = { Authorization: `Bearer ${token}` };

    // Get accounts
    const acctRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', { headers: hdrs });
    if (!acctRes.ok) {
      const err = await acctRes.json().catch(() => ({}));
      return res.status(200).send(page('Error de API', `
        <p style="color:#f87171">No se pudo acceder a GMB Accounts: <strong>${err?.error?.message || acctRes.status}</strong></p>
        <p style="color:#aaa;font-size:13px">Asegúrate de que estas APIs estén activadas en Google Cloud:<br>
        • My Business Account Management API<br>
        • My Business Business Information API<br>
        • Business Profile Performance API</p>
      `));
    }

    const { accounts = [] } = await acctRes.json();
    if (!accounts.length) {
      return res.status(200).send(page('Sin cuentas', '<p style="color:#aaa">No se encontraron cuentas de Google My Business asociadas a este token.</p>'));
    }

    // Get locations for each account
    let html = '';
    for (const acct of accounts.slice(0, 5)) {
      const locRes = await fetch(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${acct.name}/locations?readMask=name,title,websiteUri`,
        { headers: hdrs }
      );
      if (!locRes.ok) continue;
      const { locations = [] } = await locRes.json();
      for (const loc of locations) {
        html += `
          <div style="background:#1e1e1e;border:1px solid #333;border-radius:10px;padding:20px;margin-bottom:16px">
            <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:8px">📍 ${loc.title || loc.name}</div>
            <div style="font-size:13px;color:#aaa;margin-bottom:16px">${loc.websiteUri || ''}</div>
            <div style="font-size:11px;color:#666;margin-bottom:6px;text-transform:uppercase;letter-spacing:1px">GMB_LOCATION_NAME</div>
            <div style="background:#111;border:1px solid #E8610A;border-radius:6px;padding:12px;font-family:monospace;font-size:14px;color:#E8610A;word-break:break-all">${loc.name}</div>
            <p style="font-size:12px;color:#666;margin-top:10px">Copia este valor y agrégalo en Vercel → Settings → Environment Variables como <strong style="color:#aaa">GMB_LOCATION_NAME</strong></p>
          </div>`;
      }
    }

    if (!html) html = '<p style="color:#aaa">No se encontraron ubicaciones en esta cuenta.</p>';

    return res.status(200).send(page('Tu GMB Location Name', html));

  } catch (err) {
    return res.status(200).send(page('Error', `<p style="color:#f87171">${err.message}</p>`));
  }
};

function page(title, content) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>GMB Setup — ${title}</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#111;color:#fff;max-width:600px;margin:0 auto;padding:40px 20px}
    h1{font-size:22px;margin-bottom:6px;color:#E8610A}
    .sub{font-size:13px;color:#555;margin-bottom:30px}
  </style>
</head>
<body>
  <h1>🔧 GMB Setup</h1>
  <div class="sub">Nelly RAC Dashboard · Configuración de Google My Business</div>
  ${content}
</body>
</html>`;
}
