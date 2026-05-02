/**
 * api/callback.js
 * GET /api/callback?code=...&state=...
 *
 * Exchanges the OAuth code for tokens, stores the refresh_token in an
 * httpOnly cookie (never exposed to JS), and redirects to the dashboard.
 *
 * SaaS flow: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are the platform's
 * OAuth credentials (env vars). Per-user tokens live in the secure cookie.
 */
const { google } = require('googleapis');

// Cookie name used across all api/* handlers
const COOKIE_NAME = 'g_session';

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
  const isSecure    = protocol === 'https';

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

    // Decode site URL from state (passed by /api/auth, stored in localStorage by frontend)
    let siteUrl = '';
    try {
      const stateObj = JSON.parse(Buffer.from(state || '', 'base64').toString());
      siteUrl = stateObj.siteUrl || '';
    } catch {}

    // Store refresh token in a secure httpOnly cookie — never exposed to JS
    const cookieValue = JSON.stringify({ rt: tokens.refresh_token });
    const cookieParts = [
      `${COOKIE_NAME}=${encodeURIComponent(cookieValue)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      'Max-Age=31536000', // 1 year
    ];
    if (isSecure) cookieParts.push('Secure');
    res.setHeader('Set-Cookie', cookieParts.join('; '));

    // Pass site URL via query param so the frontend can pre-fill the URL input
    const redirectTo = siteUrl
      ? `/?step=discover&site=${encodeURIComponent(siteUrl)}`
      : '/?step=discover';

    return res.redirect(302, redirectTo);

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
