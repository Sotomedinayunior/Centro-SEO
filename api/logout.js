/**
 * api/logout.js
 * GET /api/logout
 *
 * Clears the g_session httpOnly cookie and redirects to the root (/).
 * The frontend also clears localStorage config keys on logout.
 */

const COOKIE_NAME = 'g_session';

module.exports = function handler(req, res) {
  // Expire the cookie immediately
  res.setHeader('Set-Cookie', [
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  ]);
  res.setHeader('Cache-Control', 'no-store');
  return res.redirect(302, '/');
};
