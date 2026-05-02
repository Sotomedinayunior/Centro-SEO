/**
 * api/pagespeed.js
 * GET /api/pagespeed?strategy=mobile|desktop&site=https://tudominio.com
 *
 * Runs Google PageSpeed Insights on all sitemap pages of the user's site.
 * No API key required (uses public endpoint, rate limited to 25k/day).
 *
 * Sitemap discovery mirrors api/crawl.js logic.
 */

const CONCURRENCY = 3;
const TIMEOUT_MS  = 25000;
const MAX_URLS    = 20; // PSI is slow — cap to avoid Vercel timeout

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 's-maxage=3600');

  const strategy = req.query.strategy === 'desktop' ? 'desktop' : 'mobile';

  // ── Resolve site origin ────────────────────────────────────────────────────
  const raw = req.query.site || '';
  let origin = '';
  try {
    const u = new URL(raw.startsWith('http') ? raw : 'https://' + raw);
    origin = u.origin;
  } catch {
    return res.status(400).json({ ok: false, error: 'Parámetro "site" inválido o ausente. Configura tu sitio en el dashboard.' });
  }

  try {
    const urls = await getAllUrls(origin);
    if (!urls.length) return res.status(200).json({ ok: false, error: 'No se encontraron URLs en el sitemap.' });

    const results = await checkBatch(urls.slice(0, MAX_URLS), strategy, CONCURRENCY);

    const scored = results.filter(r => r.score !== null);
    const summary = {
      total:     results.length,
      good:      results.filter(r => r.score >= 90).length,
      needsWork: results.filter(r => r.score >= 50 && r.score < 90).length,
      poor:      results.filter(r => r.score !== null && r.score < 50).length,
      failed:    results.filter(r => r.score === null).length,
      avgScore:  scored.length
        ? Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length)
        : null,
    };

    results.sort((a, b) => (a.score ?? 999) - (b.score ?? 999));

    return res.status(200).json({ ok: true, strategy, summary, results, checkedAt: new Date().toISOString() });

  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};

// ── Sitemap discovery (mirrors crawl.js) ─────────────────────────────────────
async function getAllUrls(origin) {
  const candidates = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/page-sitemap.xml`,
    `${origin}/post-sitemap.xml`,
    `${origin}/product-sitemap.xml`,
  ];

  const all = [];

  for (const sitemapUrl of candidates) {
    try {
      const r = await fetchWithTimeout(sitemapUrl, 8000);
      if (!r.ok) continue;
      const xml = await r.text();

      // Sitemap index?
      const sitemapRefs = [...xml.matchAll(/<sitemap>\s*<loc>\s*(https?:\/\/[^<]+?)\s*<\/loc>/gi)];
      if (sitemapRefs.length > 0) {
        for (const ref of sitemapRefs.slice(0, 4)) {
          try {
            const r2 = await fetchWithTimeout(ref[1].trim(), 8000);
            if (!r2.ok) continue;
            extractLocs(await r2.text()).forEach(u => { if (!all.includes(u)) all.push(u); });
          } catch {}
        }
      } else {
        extractLocs(xml).forEach(u => { if (!all.includes(u)) all.push(u); });
      }

      if (all.length > 0) break;
    } catch {}
  }

  if (all.length === 0) all.push(origin + '/');
  return all;
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>\s*(https?:\/\/[^<]+?)\s*<\/loc>/g)]
    .map(m => m[1].trim());
}

// ── PSI check ─────────────────────────────────────────────────────────────────
async function checkBatch(urls, strategy, concurrency) {
  const results = [];
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const checked = await Promise.all(batch.map(u => checkPage(u, strategy)));
    results.push(...checked);
  }
  return results;
}

async function checkPage(url, strategy) {
  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance`;
  try {
    const r = await fetchWithTimeout(apiUrl, TIMEOUT_MS);
    if (!r.ok) return { url, score: null, error: `HTTP ${r.status}`, cwv: null, opportunities: [] };
    const data = await r.json();

    const cats   = data.lighthouseResult?.categories || {};
    const audits = data.lighthouseResult?.audits || {};

    const score = cats.performance?.score != null ? Math.round(cats.performance.score * 100) : null;

    const cwv = {
      fcp:  getMetric(audits, 'first-contentful-paint'),
      lcp:  getMetric(audits, 'largest-contentful-paint'),
      tbt:  getMetric(audits, 'total-blocking-time'),
      cls:  getMetric(audits, 'cumulative-layout-shift'),
      ttfb: getMetric(audits, 'server-response-time'),
      si:   getMetric(audits, 'speed-index'),
    };

    const opportunities = Object.values(audits)
      .filter(a => a.details?.type === 'opportunity' && a.score != null && a.score < 0.9)
      .map(a => ({ title: a.title, impact: a.score < 0.5 ? 'high' : 'medium' }))
      .slice(0, 5);

    return { url, score, cwv, opportunities, error: null };

  } catch (err) {
    return { url, score: null, error: 'Timeout o error de red', cwv: null, opportunities: [] };
  }
}

function getMetric(audits, key) {
  const a = audits[key];
  if (!a) return null;
  return {
    value:        a.numericValue != null ? +a.numericValue.toFixed(2) : null,
    displayValue: a.displayValue || null,
    score:        a.score != null ? Math.round(a.score * 100) : null,
  };
}

function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(t));
}
