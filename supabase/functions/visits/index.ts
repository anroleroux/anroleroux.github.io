import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Origin → CORS + environment ──────────────────────────────────────────────
// DUPLICATED VERBATIM IN EVERY EDGE FUNCTION — keep the four copies identical.
// It cannot live in a shared module: Supabase will not accept a function whose
// name starts with an underscore, so there is no `_shared/` to import from.
//
// Staging and production run the SAME online build against the SAME Supabase
// project, distinguished only by hostname. That makes the request Origin the
// authoritative source for `env`: the browser sets it and page script cannot
// forge it, so it is preferred over the build stamp the client sends.
//
// When the site moves domains, the new hostnames must be added here — in all
// four functions — and the functions redeployed BEFORE the DNS cutover, or CORS
// starts failing closed the moment traffic arrives on the new name.
const STAGING = 0;
const PRODUCTION = 1;

const ENV_BY_ORIGIN: Record<string, number> = {
  'https://anroleroux.co.za':          PRODUCTION,
  'https://www.anroleroux.co.za':      PRODUCTION,
  'https://anroleroux.github.io':      PRODUCTION,  // pre-custom-domain Pages URL
  'https://staging.anroleroux.co.za':  STAGING,
};

// Used when a request carries no Origin at all (curl, server-to-server calls).
const DEFAULT_ORIGIN = 'https://anroleroux.co.za';

function isAllowedOrigin(origin: string | null): boolean {
  return origin !== null && origin in ENV_BY_ORIGIN;
}

/** CORS headers echoing the caller's origin, or the production origin if absent. */
function corsFor(req: Request, methods: string): Record<string, string> {
  const origin = req.headers.get('origin');
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin! : DEFAULT_ORIGIN,
    'Access-Control-Allow-Methods': `${methods}, OPTIONS`,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

/**
 * Resolve which build a request came from. Origin first (server-authoritative);
 * only when the origin is unknown do we fall back to the client's stamp, and an
 * invalid stamp resolves to production so a malformed request can never quietly
 * hide traffic in the staging bucket.
 */
function envFor(req: Request, claimed: unknown): number {
  const origin = req.headers.get('origin');
  if (isAllowedOrigin(origin)) return ENV_BY_ORIGIN[origin!];
  return claimed === STAGING ? STAGING : PRODUCTION;
}

// Read-only: returns the weekly page-view series for a single page so the
// article meta-bar can draw a sparkline. page_views is RLS-locked, so this
// connects as service role and calls the `visits_weekly` SQL function.

Deno.serve(async (req: Request): Promise<Response> => {
  const CORS = corsFor(req, 'GET');

  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS });
  }

  const url  = new URL(req.url);
  const page = (url.searchParams.get('page') ?? '/').slice(0, 500);

  // Scope the series to the calling build, so the production sparkline never
  // counts staging traffic (and staging shows its own numbers, not production's).
  const env = envFor(req, Number(url.searchParams.get('env')));

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data, error } = await supabase.rpc('visits_weekly', { p_page: page, p_env: env });
  if (error) {
    // Fail soft — the sparkline simply doesn't render.
    return json({ series: [], total: 0 });
  }

  const rows   = Array.isArray(data) ? data as { week: string; views: number }[] : [];
  const series = rows.map(r => ({ week: r.week, views: Number(r.views) }));
  const total  = series.reduce((sum, r) => sum + r.views, 0);

  return json({ series, total });
});
