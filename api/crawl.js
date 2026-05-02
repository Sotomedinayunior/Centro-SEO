/**
 * api/crawl.js
 * GET /api/crawl?site=https://tudominio.com
 *
 * Reads sitemaps from the user's configured site, checks each URL and returns:
 * status code, redirect destination, response time, page title, meta tags.
 *
 * Sitemap discovery order:
 *   /sitemap.xml → /sitemap_index.xml → /page-sitemap.xml + /post-sitemap.xml
 * Falls back to crawling just the homepage if no sitemap is found.
 */

const TIMEOUT_MS  = 10000;
const CONCURRENCY = 5;
const MAX_URLS    = 50; // safety cap per crawl

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET' });

  // ── Resolve site origin ──────────────────────────────────────────────────────
  const raw = req.query.site || '';
  let origin = '';
  try {
    const u = new URL(raw.startsWith('http') ? raw : 'https://' + raw);
    origin = u.origin; // e.g. "https://dualsym.com"
  } catch {
    return res.status(400).json({ error: 'Parámetro "site" inválido o ausente. Configura tu sitio en el dashboard.' });
  }

  try {
    // 1. Discover + fetch sitemaps
    const urls = await getAllUrls(origin);

    // 2. Check each URL in batches
    const results = await checkUrlsBatch(urls.slice(0, MAX_URLS), CONCURRENCY);

    // 3. Build summary
    const ok200 = results.filter(r => r.status === 200);
    const summary = {
      total:       results.length,
      ok:          ok200.length,
      redirects:   results.filter(r => r.status >= 300 && r.status < 400).length,
      notFound:    results.filter(r => r.status === 404).length,
      errors:      results.filter(r => r.status >= 400 && r.status !== 404).length,
      slow:        results.filter(r => r.ms > 2000).length,
      noDesc:      ok200.filter(r => !r.meta?.description).length,
      noH1:        ok200.filter(r => !r.meta?.h1).length,
      noCanonical: ok200.filter(r => !r.meta?.canonical).length,
    };

    // Sort: errors first, then redirects, then slow, then ok
    results.sort((a, b) => {
      const priority = r => {
        if (r.status === 404)                  return 0;
        if (r.status >= 400)                   return 1;
        if (r.status >= 300 && r.status < 400) return 2;
        if (r.ms > 2000)                       return 3;
        return 4;
      };
      return priority(a) - priority(b);
    });

    return res.status(200).json({ ok: true, summary, results, crawledAt: new Date().toISOString() });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── Sitemap discovery ─────────────────────────────────────────────────────────
async function getAllUrls(origin) {
  // Try sitemaps in order of likelihood
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
      const r = await fetchWithTimeout(sitemapUrl, TIMEOUT_MS);
      if (!r.ok) continue;
      const xml = await r.text();

      // A sitemap index references other sitemaps via <sitemap><loc>…
      const sitemapRefs = [...xml.matchAll(/<sitemap>\s*<loc>\s*(https?:\/\/[^<]+?)\s*<\/loc>/gi)];
      if (sitemapRefs.length > 0) {
        // It's a sitemap index — fetch each child sitemap
        for (const ref of sitemapRefs.slice(0, 6)) {
          try {
            const r2 = await fetchWithTimeout(ref[1].trim(), TIMEOUT_MS);
            if (!r2.ok) continue;
            const xml2 = await r2.text();
            extractLocs(xml2).forEach(u => { if (!all.includes(u)) all.push(u); });
          } catch {}
        }
      } else {
        // Regular sitemap
        extractLocs(xml).forEach(u => { if (!all.includes(u)) all.push(u); });
      }

      if (all.length > 0) break; // found URLs, stop trying candidates
    } catch {}
  }

  // Fallback: crawl just the homepage
  if (all.length === 0) all.push(origin + '/');

  return all;
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>\s*(https?:\/\/[^<]+?)\s*<\/loc>/g)]
    .map(m => m[1].trim());
}

// ── Check URLs in batches ─────────────────────────────────────────────────────
async function checkUrlsBatch(urls, concurrency) {
  const results = [];
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const checked = await Promise.all(batch.map(checkUrl));
    results.push(...checked);
  }
  return results;
}

async function checkUrl(url) {
  const start = Date.now();
  try {
    const r = await fetchWithTimeout(url, TIMEOUT_MS, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': 'GrowthDashboard-Crawler/2.0',
        'Accept': 'text/html',
      },
    });

    const ms       = Date.now() - start;
    const status   = r.status;
    const location = r.headers.get('location') || null;

    // Extract title + meta tags from HTML for 200 responses
    let title = null;
    let meta  = null;
    if (status === 200) {
      try {
        const html = await r.text();
        title = extractTag(html, /<title[^>]*>([^<]{1,200})<\/title>/i);
        meta  = {
          description: extractMeta(html, 'description'),
          ogTitle:     extractMeta(html, 'og:title', 'property'),
          canonical:   extractLink(html, 'canonical'),
          robots:      extractMeta(html, 'robots'),
          h1:          extractTag(html, /<h1[^>]*>([^<]{1,200})<\/h1>/i),
        };
      } catch {}
    }

    return { url, status, ms, location, title, meta, error: null };

  } catch (err) {
    return {
      url, status: 0, ms: Date.now() - start,
      location: null, title: null,
      error: err.message.includes('timeout') || err.message.includes('abort') ? 'Timeout' : 'Error de conexión',
    };
  }
}

// ── Meta tag helpers ──────────────────────────────────────────────────────────
function extractTag(html, regex) {
  try { const m = html.match(regex); return m ? m[1].trim() : null; } catch { return null; }
}
function extractMeta(html, name, attr = 'name') {
  try {
    const re = new RegExp(`<meta[^>]+${attr}=["']${name}["'][^>]+content=["']([^"']{1,300})["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']{1,300})["'][^>]+${attr}=["']${name}["']`, 'i');
    const m = html.match(re) || html.match(re2);
    return m ? m[1].trim() : null;
  } catch { return null; }
}
function extractLink(html, rel) {
  try {
    const re = new RegExp(`<link[^>]+rel=["']${rel}["'][^>]+href=["']([^"']+)["']`, 'i');
    const re2 = new RegExp(`<link[^>]+href=["']([^"']+)["'][^>]+rel=["']${rel}["']`, 'i');
    const m = html.match(re) || html.match(re2);
    return m ? m[1].trim() : null;
  } catch { return null; }
}

// ── Fetch with timeout ────────────────────────────────────────────────────────
function fetchWithTimeout(url, ms, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}
