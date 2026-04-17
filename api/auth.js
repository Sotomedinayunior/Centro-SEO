/**
 * api/auth.js
 * GET /api/auth?site=https://dualsym.com
 *
 * Redirects to Google OAuth consent screen.
 * The site URL is passed as `state` so it's available after callback.
 */
const { google } = require('googleapis');

const SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/business.manage',
];

module.exports = function handler(req, res) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(400).send(`
      <html><body style="font-family:sans-serif;padding:40px;color:#c00">
        <h2>Faltan variables de entorno</h2>
        <p>Agrega <code>GOOGLE_CLIENT_ID</code> y <code>GOOGLE_CLIENT_SECRET</code> en
        <strong>Vercel → Settings → Environment Variables</strong> y haz redeploy.</p>
      </body></html>
    `);
  }

  const host        = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const protocol    = host.includes('localhost') ? 'http' : 'https';
  const redirectUri = `${protocol}://${host}/api/callback`;

  // Pass the site URL through OAuth state so we can restore it after redirect
  const siteUrl = req.query.site || '';
  const state   = Buffer.from(JSON.stringify({ siteUrl })).toString('base64');

  const auth    = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );

  const authUrl = auth.generateAuthUrl({
    access_type:   'offline',
    prompt:        'consent',
    scope:         SCOPES,
    state,
  });

  res.redirect(authUrl);
};
