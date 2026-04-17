/**
 * api/discover.js
 * POST /api/discover
 * Body: { refreshToken }
 *
 * Returns all GSC properties and GMB locations for the authenticated user.
 * Called during setup to let the user pick their property.
 */
const { google } = require('googleapis');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken requerido' });

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ error: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no configurados en Vercel' });
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  auth.setCredentials({ refresh_token: refreshToken });

  const [gscResult, gmbResult, ga4Result] = await Promise.allSettled([
    fetchGSCProperties(auth),
    fetchGMBLocations(auth),
    fetchGA4Properties(auth),
  ]);

  return res.status(200).json({
    gscProperties: gscResult.status === 'fulfilled' ? gscResult.value : [],
    gmbLocations:  gmbResult.status === 'fulfilled' ? gmbResult.value : [],
    ga4Properties: ga4Result.status === 'fulfilled' ? ga4Result.value : [],
    gscError:      gscResult.status === 'rejected'  ? gscResult.reason?.message : null,
    gmbError:      gmbResult.status === 'rejected'  ? gmbResult.reason?.message : null,
    ga4Error:      ga4Result.status === 'rejected'  ? ga4Result.reason?.message : null,
  });
};

async function fetchGSCProperties(auth) {
  const sc = google.searchconsole({ version: 'v1', auth });
  const r  = await sc.sites.list();
  return (r.data.siteEntry || []).map(s => ({
    url:           s.siteUrl,
    permissionLevel: s.permissionLevel,
  }));
}

async function fetchGA4Properties(auth) {
  const { token } = await auth.getAccessToken();
  const hdrs = { Authorization: `Bearer ${token}` };
  const r = await fetch(
    'https://analyticsadmin.googleapis.com/v1beta/properties?filter=parent:accounts/~all&pageSize=50',
    { headers: hdrs }
  );
  if (!r.ok) throw new Error('No se pudo acceder a GA4 properties');
  const { properties = [] } = await r.json();
  return properties.map(p => ({
    name:        p.name,           // properties/XXXXXXXXX
    displayName: p.displayName,
    websiteUrl:  p.websiteUrl || '',
  }));
}

async function fetchGMBLocations(auth) {
  const { token } = await auth.getAccessToken();
  const hdrs = { Authorization: `Bearer ${token}` };

  const acctRes = await fetch(
    'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
    { headers: hdrs }
  );
  if (!acctRes.ok) throw new Error('No se pudo acceder a GMB accounts');

  const { accounts = [] } = await acctRes.json();
  if (!accounts.length) return [];

  const locations = [];
  for (const acct of accounts.slice(0, 3)) {
    const locRes = await fetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${acct.name}/locations?readMask=name,title,websiteUri,metadata`,
      { headers: hdrs }
    );
    if (!locRes.ok) continue;
    const { locations: locs = [] } = await locRes.json();
    for (const loc of locs) {
      locations.push({
        name:       loc.name,     // accounts/.../locations/...
        title:      loc.title || loc.name,
        websiteUri: loc.websiteUri || '',
      });
    }
  }
  return locations;
}
