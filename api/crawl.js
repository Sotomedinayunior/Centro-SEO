/**
 * api/crawl.js
 * GET /api/crawl
 *
 * Reads sitemaps from nellyrac.do, checks each URL and returns:
 * status code, redirect destination, response time, page title.
 */

const SITEMAPS = [
  'https://nellyrac.do/page-sitemap.xml',
  'https://nellyrac.do/post-sitemap.xml',
];

const TIMEOUT_MS  = 10000;
const CONCURRENCY = 5;

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET' });

  try {
    // 1. Fetch and parse all sitemaps
    const urls = await getAllUrls();

    // 2. Check each URL in batches
    const results = await checkUrlsBatch(urls, CONCURRENCY);

    // 3. Build summary
    const summary = {
      total:      results.length,
      ok:         results.filter(r => r.status === 200).length,
      redirects:  results.filter(r => r.status >= 300 && r.status < 400).length,
      notFound:   results.filter(r => r.status === 404).length,
      errors:     results.filter(r => r.status >= 400 && r.status !== 404).length,
      slow:       results.filter(r => r.ms > 2000).length,
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

// ── Fetch and parse sitemaps ──────────────────────────────────────────────────
async function getAllUrls() {
  const all = [];
  for (const sitemapUrl of SITEMAPS) {
    try {
      const r = await fetchWithTimeout(sitemapUrl, TIMEOUT_MS);
      if (!r.ok) continue;
      const xml = await r.text();
      const matches = [...xml.matchAll(/<loc>\s*(https?:\/\/[^<]+?)\s*<\/loc>/g)];
      matches.forEach(m => {
        const url = m[1].trim();
        if (!all.includes(url)) all.push(url);
      });
    } catch {}
  }
  return all;
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
        'User-Agent': 'NellyDashboard-Crawler/1.0',
        'Accept': 'text/html',
      },
    });

    const ms       = Date.now() - start;
    const status   = r.status;
    const location = r.headers.get('location') || null;

    // Try to extract title from HTML for 200 responses
    let title = null;
    if (status === 200) {
      try {
        const html = await r.text();
        const match = html.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
        title = match ? match[1].trim() : null;
      } catch {}
    }

    return { url, status, ms, location, title, error: null };

  } catch (err) {
    return {
      url, status: 0, ms: Date.now() - start,
      location: null, title: null,
      error: err.message.includes('timeout') ? 'Timeout' : 'Error de conexión',
    };
  }
}

// ── Fetch with timeout ────────────────────────────────────────────────────────
function fetchWithTimeout(url, ms, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}
