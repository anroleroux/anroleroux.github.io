import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Rate-limit config — reuses the shared `rate_limits` table (keyed by hashed IP).
const RATE_LIMIT_MAX    = 5;          // max submissions per window per IP
const RATE_LIMIT_WINDOW = 600_000;    // 10 minutes in ms

const ALLOWED_ORIGIN = 'https://anroleroux.co.za';

const CORS = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Keep in sync with the check constraint on public.contact_requests.
const LOOKING_FOR = new Set(['build-unblock', 'mentoring', 'website', 'math']);

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
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

// Trim and clamp a free-text field; returns null when empty after trimming.
function clean(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, max);
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
  let body: {
    name?: unknown; surname?: unknown; email?: unknown; looking_for?: unknown;
    note?: unknown; session_token?: unknown;
  } = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Bad Request' }, 400);
  }

  // ── Validate ─────────────────────────────────────────────────────────────
  const name        = clean(body.name, 120);
  const surname     = clean(body.surname, 120);
  const email       = clean(body.email, 254);
  const note        = clean(body.note, 4000);
  const lookingFor  = typeof body.looking_for === 'string' ? body.looking_for : '';

  if (!name || !surname) {
    return jsonResponse({ error: 'Name and surname are required.' }, 422);
  }
  if (!email || !EMAIL_RE.test(email)) {
    return jsonResponse({ error: 'A valid email address is required.' }, 422);
  }
  if (!LOOKING_FOR.has(lookingFor)) {
    return jsonResponse({ error: 'Please choose what you are looking for.' }, 422);
  }

  const sessionToken =
    typeof body.session_token === 'string' && UUID_RE.test(body.session_token)
      ? body.session_token
      : null;

  // IP is hashed only for rate limiting; it is not stored on the contact
  // request (the linked session row already carries IP/user-agent context).
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
    return jsonResponse({ error: 'Too many submissions — please try again later.' }, 429);
  }

  await supabase.from('rate_limits').insert({ ip_hash: ipHash });

  // ── Store the request ────────────────────────────────────────────────────
  const { error } = await supabase.from('contact_requests').insert({
    name,
    surname,
    email,
    looking_for:   lookingFor,
    note,
    session_token: sessionToken,
  });

  if (error) {
    return jsonResponse({ error: 'Could not save your message. Please try again.' }, 500);
  }

  return jsonResponse({ ok: true }, 200);
});
