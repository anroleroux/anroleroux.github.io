import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Read-only: returns the weekly page-view series for a single page so the
// article meta-bar can draw a sparkline. page_views is RLS-locked, so this
// connects as service role and calls the `visits_weekly` SQL function.

const ALLOWED_ORIGIN = 'https://anroleroux.co.za';

const CORS = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS });
  }

  const url  = new URL(req.url);
  const page = (url.searchParams.get('page') ?? '/').slice(0, 500);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data, error } = await supabase.rpc('visits_weekly', { p_page: page });
  if (error) {
    // Fail soft — the sparkline simply doesn't render.
    return json({ series: [], total: 0 });
  }

  const rows   = Array.isArray(data) ? data as { week: string; views: number }[] : [];
  const series = rows.map(r => ({ week: r.week, views: Number(r.views) }));
  const total  = series.reduce((sum, r) => sum + r.views, 0);

  return json({ series, total });
});
