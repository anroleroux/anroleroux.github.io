import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Rate-limit config
const RATE_LIMIT_MAX    = 30;         // max requests per window per IP
const RATE_LIMIT_WINDOW = 60_000;     // 1 minute in ms
const RATE_LIMIT_PRUNE  = 120_000;    // prune rows older than 2 min

const ALLOWED_ORIGIN = 'https://anroleroux.github.io';

const CORS = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Geo lookup ───────────────────────────────────────────────────────────────
// cf-ipcountry is handled separately (it passes through Supabase's infra).
// The richer cf-ip* headers are Cloudflare Workers-only; ipapi.co fills the rest.
// Free tier: 1000 req/day, no key needed. Returns nulls on any failure.

interface GeoResult {
  country: string | null;
  city: string | null;
  continent: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  asorg: string | null;
}

async function fetchGeo(ip: string): Promise<GeoResult> {
  const empty: GeoResult = { country: null, city: null, continent: null, latitude: null, longitude: null, timezone: null, asorg: null };
  if (ip === 'unknown') return empty;
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      headers: { 'User-Agent': 'anroleroux.github.io/analytics' },
      signal: AbortSignal.timeout(2000), // don't block the response more than 2s
    });
    if (!res.ok) return empty;
    const d = await res.json();
    if (d.error) return empty;
    return {
      country:   typeof d.country_code   === 'string' ? d.country_code   : null,
      city:      typeof d.city           === 'string' ? d.city           : null,
      continent: typeof d.continent_code === 'string' ? d.continent_code : null,
      latitude:  typeof d.latitude       === 'number' ? d.latitude       : null,
      longitude: typeof d.longitude      === 'number' ? d.longitude      : null,
      timezone:  typeof d.timezone       === 'string' ? d.timezone       : null,
      asorg:     typeof d.org            === 'string' ? d.org            : null,
    };
  } catch {
    return empty;
  }
}

// ── Bot detection ─────────────────────────────────────────────────────────────

// User-agent substrings that identify crawlers, headless browsers, and scrapers.
const BOT_UA_RE = /bot|crawler|spider|scraper|headless|phantom|selenium|puppeteer|playwright|curl|wget|python-requests|go-http|java\/|apache-httpclient|scrapy|libwww|httpclient|okhttp|axios\/|node-fetch|lighthouse|facebookexternalhit|twitterbot|linkedinbot|whatsapp|slackbot|discordbot|telegrambot|applebot|duckduckbot|bingpreview|ia_archiver/i;

// ASN organisations that are datacenters / cloud providers — bots running there
// rarely have a matching browser UA, but undeclared scrapers do.
const BOT_ASORG_RE = /google|amazon|microsoft|digitalocean|linode|akamai|cloudflare|fastly|ovh|hetzner|vultr|leaseweb|datacenter|hosting|server|cdn|aws|azure|gcp/i;

function isBot(userAgent: string | null, asorg: string | null): boolean {
  if (userAgent && BOT_UA_RE.test(userAgent)) return true;
  // Only use asorg as a signal when the UA is missing or suspiciously short —
  // legitimate users on corporate VPNs (AWS, Azure) have a real browser UA.
  if (asorg && (!userAgent || userAgent.length < 20) && BOT_ASORG_RE.test(asorg)) return true;
  return false;
}

async function hashValue(value: string): Promise<string> {
  const salt = Deno.env.get('IP_HASH_SALT') ?? '';
  const buf  = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value + salt),
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS });
  }

  // Parse body
  let body: { session_token?: unknown; page?: unknown; referrer?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return new Response('Bad Request', { status: 400, headers: CORS });
  }

  // Validate session token (UUID generated client-side)
  if (typeof body.session_token !== 'string' || !UUID_RE.test(body.session_token)) {
    return new Response('Bad Request', { status: 400, headers: CORS });
  }

  const sessionToken = body.session_token;
  const page         = typeof body.page     === 'string' ? body.page.slice(0, 500)     : '/';
  const referrer     = typeof body.referrer === 'string' ? body.referrer.slice(0, 1000) : null;
  const userAgent    = req.headers.get('user-agent')?.slice(0, 500) ?? null;

  // Get raw IP before hashing — needed for geo lookup
  const rawIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  const geo = await fetchGeo(rawIp);

  // cf-ipcountry is set by Cloudflare and is only present on the rare request where
  // that header survives Supabase's infra; prefer it when valid, otherwise fall back
  // to the country code from ipapi.co (which also supplies the richer geo fields).
  const cfCountry = req.headers.get('cf-ipcountry');
  const country   = cfCountry && /^[A-Z]{2}$/.test(cfCountry) && cfCountry !== 'XX' && cfCountry !== 'T1'
    ? cfCountry
    : geo.country;

  // Bot check — return 200 silently so bots get no signal they were filtered
  if (isBot(userAgent, geo.asorg)) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Hash IP (never stored in plain text)
  const ipHash = await hashValue(rawIp);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ── Rate limiting (sliding window by hashed IP) ──────────────────────────
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW).toISOString();

  const { count } = await supabase
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', windowStart);

  if ((count ?? 0) >= RATE_LIMIT_MAX) {
    return new Response('Too Many Requests', { status: 429, headers: CORS });
  }

  await supabase.from('rate_limits').insert({ ip_hash: ipHash });

  // Prune stale rate-limit rows on ~1% of requests to keep the table small
  if (Math.random() < 0.01) {
    const cutoff = new Date(Date.now() - RATE_LIMIT_PRUNE).toISOString();
    await supabase.from('rate_limits').delete().lt('created_at', cutoff);
  }

  // ── Associate session with an authenticated user ────────────────────────
  // The client passes the user's JWT when signed in, or the anon key otherwise.
  // createClient with the user's token lets getUser() validate and decode it;
  // it returns null for the anon key (which is not a user JWT).
  let userId: string | null = null;
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const { data } = await createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    ).auth.getUser();
    userId = data.user?.id ?? null;
  }

  // ── Upsert session ───────────────────────────────────────────────────────
  await supabase.from('sessions').upsert(
    {
      session_token: sessionToken,
      ip_hash:       ipHash,
      country,
      continent:  geo.continent,
      city:       geo.city,
      latitude:   geo.latitude,
      longitude:  geo.longitude,
      timezone:   geo.timezone,
      asorg:      geo.asorg,
      user_agent:    userAgent,
      user_id:       userId,
      last_seen:     new Date().toISOString(),
    },
    { onConflict: 'session_token' },
  );

  // ── Record page view ─────────────────────────────────────────────────────
  await supabase.from('page_views').insert({
    session_token: sessionToken,
    page,
    referrer,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
