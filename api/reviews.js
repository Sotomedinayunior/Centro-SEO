/**
 * api/reviews.js
 * GET /api/reviews
 *
 * ⚠️  PRÓXIMAMENTE — Feature deshabilitada en esta versión del MVP.
 * Las reseñas externas vía SerpAPI estarán disponibles próximamente.
 * Las reseñas de Google My Business siguen disponibles vía /api/data.
 */

module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(503).json({
    error: 'coming_soon',
    message: 'Las reseñas externas estarán disponibles próximamente.',
  });
};
