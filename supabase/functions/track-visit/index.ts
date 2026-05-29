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

  // Hash IP (never stored in plain text)
  const rawIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
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

  // ── Optional: associate session with an authenticated user ───────────────
  // When you add Supabase Auth, pass the user's JWT as the Authorization header
  // from the client and uncomment the block below.
  //
  // let userId: string | null = null;
  // const authHeader = req.headers.get('Authorization');
  // if (authHeader?.startsWith('Bearer ')) {
  //   const token = authHeader.slice(7);
  //   const authClient = createClient(
  //     Deno.env.get('SUPABASE_URL')!,
  //     Deno.env.get('SUPABASE_ANON_KEY')!,
  //   );
  //   const { data: { user } } = await authClient.auth.getUser(token);
  //   userId = user?.id ?? null;
  // }

  // ── Upsert session ───────────────────────────────────────────────────────
  await supabase.from('sessions').upsert(
    {
      session_token: sessionToken,
      ip_hash:       ipHash,
      user_agent:    userAgent,
      last_seen:     new Date().toISOString(),
      // user_id: userId,   // uncomment when auth is wired up
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
