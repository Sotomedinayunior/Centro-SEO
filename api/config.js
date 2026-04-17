/**
 * api/config.js
 * GET /api/config
 *
 * Returns only the public (non-secret) config needed by the frontend.
 * The client ID is safe to expose — it's not the secret.
 */
module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    clientId:  process.env.GOOGLE_CLIENT_ID || null,
    ready:     !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  });
};
