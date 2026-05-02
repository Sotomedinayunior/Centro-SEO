/**
 * api/claude.js
 * POST /api/claude
 *
 * ⚠️  PRÓXIMAMENTE — Feature deshabilitada en esta versión del MVP.
 * El endpoint existe para que el frontend no lance un error de red,
 * pero devuelve un 503 con coming_soon hasta que se habilite.
 */

module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(503).json({
    error: 'coming_soon',
    message: 'El análisis con IA estará disponible próximamente.',
  });
};
