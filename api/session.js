/**
 * api/session.js
 * GET /api/session
 *
 * Returns { loggedIn: true } if the user has a valid g_session cookie,
 * { loggedIn: false } otherwise.
 *
 * The frontend uses this to decide whether to show the login screen
 * or the dashboard. Never exposes the actual token.
 */

const COOKIE_NAME = 'g_session';

function parseCookie(req) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k.trim() === COOKIE_NAME) {
      try {
        return JSON.parse(decodeURIComponent(v.join('=')));
      } catch { return null; }
    }
  }
  return null;
}

module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  const session = parseCookie(req);
  const loggedIn = !!(session && session.rt);

  return res.status(200).json({ loggedIn });
};
