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

  // Cloudflare geo headers — read before hashing the IP (the only moment raw IP data is visible)
  // All headers are injected by Cloudflare at no cost; GPS is city-level precision.
  const cfCountry = req.headers.get('cf-ipcountry');
  const country   = cfCountry && /^[A-Z]{2}$/.test(cfCountry) && cfCountry !== 'XX' && cfCountry !== 'T1'
    ? cfCountry
    : null;
  const continent = req.headers.get('cf-ipcontinent') ?? null;
  const city      = req.headers.get('cf-ipcity')      ?? null;
  const timezone  = req.headers.get('cf-timezone')    ?? null;
  const asorg     = req.headers.get('cf-asorganization') ?? null;

  const rawLat = req.headers.get('cf-iplatitude');
  const rawLon = req.headers.get('cf-iplongitude');
  const latitude  = rawLat ? parseFloat(rawLat) : null;
  const longitude = rawLon ? parseFloat(rawLon) : null;

  // Bot check — return 200 silently so bots get no signal they were filtered
  if (isBot(userAgent, asorg)) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Hash IP (never stored in plain text)
  const rawIp  = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
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
      continent,
      city,
      latitude,
      longitude,
      timezone,
      asorg,
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
