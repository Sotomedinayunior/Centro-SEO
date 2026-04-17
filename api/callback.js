/**
 * api/callback.js
 * GET /api/callback?code=...&state=...
 *
 * Exchanges the OAuth code for tokens, then returns an HTML page
 * that saves the refresh_token in localStorage and redirects to the dashboard.
 */
const { google } = require('googleapis');

module.exports = async function handler(req, res) {
  const { code, error, state } = req.query;

  if (error) {
    return res.status(400).send(errorPage(
      'Google rechazó la autorización',
      error,
      'Asegúrate de que la pantalla de consentimiento OAuth esté configurada como <strong>External</strong> y que tu email esté en la lista de Test Users.'
    ));
  }

  if (!code) return res.redirect('/');

  const host        = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const protocol    = host.includes('localhost') ? 'http' : 'https';
  const redirectUri = `${protocol}://${host}/api/callback`;

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );

  try {
    const { tokens } = await auth.getToken(code);

    if (!tokens.refresh_token) {
      return res.status(400).send(errorPage(
        'No se generó el refresh_token',
        'missing_refresh_token',
        'Revoca el acceso de la app en <a href="https://myaccount.google.com/permissions" target="_blank">Google Account Permissions</a> e intenta de nuevo. Esto suele pasar cuando ya autorizaste la app antes.'
      ));
    }

    // Decode site URL from state
    let siteUrl = '';
    try {
      const stateObj = JSON.parse(Buffer.from(state || '', 'base64').toString());
      siteUrl = stateObj.siteUrl || '';
    } catch {}

    // Return HTML page that stores tokens in localStorage and redirects
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Conectando…</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #1a1a1a; color: #fff;
           display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .box { text-align: center; }
    .spinner { width: 40px; height: 40px; border: 3px solid #333; border-top-color: #E8610A;
               border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 20px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    p { color: #888; font-size: 14px; }
  </style>
</head>
<body>
  <div class="box">
    <div class="spinner"></div>
    <p>Guardando credenciales…</p>
  </div>
  <script>
    try {
      localStorage.setItem('g_rt', ${JSON.stringify(tokens.refresh_token)});
      ${siteUrl ? `localStorage.setItem('g_site', ${JSON.stringify(siteUrl)});` : ''}
    } catch(e) {
      console.error('localStorage error', e);
    }
    // Redirect to dashboard with discover step
    window.location.href = '/?step=discover';
  </script>
</body>
</html>`);

  } catch (err) {
    return res.status(500).send(errorPage(
      'Error al obtener tokens',
      err.message,
      'Verifica que el <strong>Client ID</strong> y <strong>Client Secret</strong> en Vercel sean correctos y que el redirect URI en Google Cloud sea exactamente: <code>' + redirectUri + '</code>'
    ));
  }
};

function errorPage(title, detail, hint) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Error — Dashboard</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 600px; margin: 60px auto; padding: 20px; color: #1a1a1a; }
  h2 { color: #c00; }
  .detail { background: #f5f5f5; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 13px; color: #555; }
  .hint { background: #fff8f4; border-left: 4px solid #E8610A; padding: 12px 16px; margin-top: 16px; border-radius: 0 6px 6px 0; font-size: 14px; }
  a { color: #E8610A; font-weight: 600; display: inline-block; margin-top: 20px; }
</style>
</head>
<body>
  <h2>⚠️ ${title}</h2>
  <div class="detail">${detail}</div>
  <div class="hint">${hint}</div>
  <a href="/">← Volver al dashboard</a>
</body>
</html>`;
}
