/**
 * api/reply.js
 * POST /api/reply
 *
 * Generates a professional review reply using Claude AI.
 * Body: { reviewText, stars, reviewerName, locationName }
 * Returns: { reply: "..." }
 *
 * Requires: CLAUDE_API_KEY
 */

const CLAUDE_API   = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'CLAUDE_API_KEY no configurada' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ error: 'Body inválido' }); }

  const { reviewText, stars, reviewerName, locationName } = body;
  if (!stars) return res.status(400).json({ error: 'stars requerido' });

  const firstName = (reviewerName || 'Cliente').split(' ')[0];
  const starsNum  = parseInt(stars, 10);
  const isNeg     = starsNum <= 2;
  const isNeu     = starsNum === 3;
  const isPos     = starsNum >= 4;

  const tone = isPos ? 'cálida, agradecida y entusiasta'
             : isNeu ? 'cordial, agradecida y con enfoque en mejorar'
             : 'empática, disculpándose sinceramente y ofreciendo solución';

  const systemPrompt = `Eres el community manager de Nelly RAC, empresa de alquiler de autos en República Dominicana.
Escribes respuestas a reseñas de Google en español dominicano natural y profesional.
Reglas:
- Máximo 4 oraciones
- Usa el nombre del cliente (${firstName})
- Tono ${tone}
- Menciona la sucursal "${locationName || 'Nelly RAC'}" si es relevante
- Si es negativa: pide disculpas, ofrece contacto directo (no des datos reales, solo menciona "contáctenos directamente")
- Nunca menciones que eres una IA
- Termina siempre invitando al cliente a volver o a contactarnos
- Responde SOLO con el texto de la respuesta, sin comillas ni explicaciones`;

  const userPrompt = `Reseña recibida (${starsNum} estrella${starsNum > 1 ? 's' : ''}) de ${firstName}:
"${reviewText || 'Sin comentario escrito'}"

Escribe la respuesta para esta reseña.`;

  try {
    const response = await fetch(CLAUDE_API, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      CLAUDE_MODEL,
        max_tokens: 300,
        system:     systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      return res.status(502).json({ error: `Claude API ${response.status}: ${err.slice(0, 200)}` });
    }

    const data  = await response.json();
    const reply = data.content?.[0]?.text?.trim() || '';

    return res.status(200).json({ ok: true, reply });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
