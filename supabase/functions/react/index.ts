import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Throttle config ──────────────────────────────────────────────────────────
const IP_LIMIT_MAX      = 30;         // max requests per window per IP
const IP_LIMIT_WINDOW   = 60_000;     // 1 minute in ms
const IP_LIMIT_PRUNE    = 120_000;    // prune rate_limit rows older than 2 min

const SESSION_LIMIT_MAX    = 5;       // max accepted reactions per session+page per window
const SESSION_LIMIT_WINDOW = 60_000;  // 1 minute in ms

const ALLOWED_ORIGIN = 'https://anroleroux.co.za';

const CORS = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Reactions are stored as SMALLINT codes 1..REACTION_COUNT. This function stays
// agnostic to what each code means — the labels live in the article HTML/JS.
const REACTION_COUNT = 3;

// Crawlers / headless browsers / scrapers — no signal they were filtered.
const BOT_UA_RE = /bot|crawler|spider|scraper|headless|phantom|selenium|puppeteer|playwright|curl|wget|python-requests|go-http|java\/|apache-httpclient|scrapy|libwww|httpclient|okhttp|axios\/|node-fetch|lighthouse|facebookexternalhit|twitterbot|linkedinbot|whatsapp|slackbot|discordbot|telegrambot|applebot|duckduckbot|bingpreview|ia_archiver/i;

async function hashValue(value: string): Promise<string> {
  const salt = Deno.env.get('IP_HASH_SALT') ?? '';
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value + salt));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// Count each reaction code for a page (head counts — no row transfer). Keyed by
// the numeric code; the article decides what each code means.
async function countsFor(
  supabase: ReturnType<typeof createClient>,
  page: string,
): Promise<Record<number, number>> {
  const out: Record<number, number> = {};
  for (let code = 1; code <= REACTION_COUNT; code++) {
    const { count } = await supabase
      .from('reaction_events')
      .select('*', { count: 'exact', head: true })
      .eq('page', page)
      .eq('reaction', code);
    out[code] = count ?? 0;
  }
  return out;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ── GET: read counts for a page ────────────────────────────────────────────
  if (req.method === 'GET') {
    const url  = new URL(req.url);
    const page = (url.searchParams.get('page') ?? '/').slice(0, 500);
    return json({ counts: await countsFor(supabase, page) });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS });
  }

  // ── Parse + validate ───────────────────────────────────────────────────────
  let body: { session_token?: unknown; page?: unknown; reaction?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return new Response('Bad Request', { status: 400, headers: CORS });
  }

  if (typeof body.session_token !== 'string' || !UUID_RE.test(body.session_token)) {
    return new Response('Bad Request', { status: 400, headers: CORS });
  }
  if (typeof body.reaction !== 'number' || !Number.isInteger(body.reaction)
      || body.reaction < 1 || body.reaction > REACTION_COUNT) {
    return new Response('Bad Request', { status: 400, headers: CORS });
  }

  const sessionToken = body.session_token;
  const reaction     = body.reaction;
  const page         = typeof body.page === 'string' ? body.page.slice(0, 500) : '/';
  const userAgent    = req.headers.get('user-agent')?.slice(0, 500) ?? null;

  // Bot check — echo current counts so bots get no signal they were filtered.
  if (userAgent && BOT_UA_RE.test(userAgent)) {
    return json({ counts: await countsFor(supabase, page) });
  }

  // ── IP rate limit (sliding window by hashed IP; shared rate_limits table) ───
  const rawIp  = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const ipHash = await hashValue(rawIp);

  const ipWindowStart = new Date(Date.now() - IP_LIMIT_WINDOW).toISOString();
  const { count: ipCount } = await supabase
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', ipWindowStart);

  if ((ipCount ?? 0) >= IP_LIMIT_MAX) {
    return json({ counts: await countsFor(supabase, page), throttled: true }, 429);
  }
  await supabase.from('rate_limits').insert({ ip_hash: ipHash });

  if (Math.random() < 0.01) {
    const cutoff = new Date(Date.now() - IP_LIMIT_PRUNE).toISOString();
    await supabase.from('rate_limits').delete().lt('created_at', cutoff);
  }

  // ── Per-session throttle (unlimited clicks, but capped per window) ──────────
  const sessWindowStart = new Date(Date.now() - SESSION_LIMIT_WINDOW).toISOString();
  const { count: sessCount } = await supabase
    .from('reaction_events')
    .select('*', { count: 'exact', head: true })
    .eq('session_token', sessionToken)
    .eq('page', page)
    .gte('created_at', sessWindowStart);

  if ((sessCount ?? 0) >= SESSION_LIMIT_MAX) {
    return json({ counts: await countsFor(supabase, page), throttled: true }, 429);
  }

  // ── Record the click ───────────────────────────────────────────────────────
  await supabase.from('reaction_events').insert({
    session_token: sessionToken,
    page,
    reaction: reaction,
  });

  return json({ counts: await countsFor(supabase, page) });
});
