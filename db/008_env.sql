-- Tag every interaction row with the build that wrote it.
--   0 = staging, 1 = production
--
-- Staging and production deploy the same online build against the SAME Supabase
-- project, so without this column their rows are indistinguishable. The edge
-- functions resolve env from the request Origin (staging and production are
-- distinct hostnames) and fall back to the client's build stamp only for an
-- unrecognised origin.
--
-- The column is added with DEFAULT 1 so the rows that already exist — all of
-- them written by production, which was the only deployed online build — are
-- backfilled correctly. The default is then dropped: every insert must state its
-- env explicitly, so a function that forgets to set it fails loudly instead of
-- silently writing staging traffic into the production numbers.
--
-- rate_limits deliberately has no env column: it is infrastructure, not an
-- interaction, and the limit is meant to be shared across both builds.

ALTER TABLE sessions         ADD COLUMN IF NOT EXISTS env SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE page_views       ADD COLUMN IF NOT EXISTS env SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS env SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE reaction_events  ADD COLUMN IF NOT EXISTS env SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE sessions         DROP CONSTRAINT IF EXISTS sessions_env_check;
ALTER TABLE page_views       DROP CONSTRAINT IF EXISTS page_views_env_check;
ALTER TABLE contact_requests DROP CONSTRAINT IF EXISTS contact_requests_env_check;
ALTER TABLE reaction_events  DROP CONSTRAINT IF EXISTS reaction_events_env_check;

ALTER TABLE sessions         ADD CONSTRAINT sessions_env_check         CHECK (env IN (0, 1));
ALTER TABLE page_views       ADD CONSTRAINT page_views_env_check       CHECK (env IN (0, 1));
ALTER TABLE contact_requests ADD CONSTRAINT contact_requests_env_check CHECK (env IN (0, 1));
ALTER TABLE reaction_events  ADD CONSTRAINT reaction_events_env_check  CHECK (env IN (0, 1));

ALTER TABLE sessions         ALTER COLUMN env DROP DEFAULT;
ALTER TABLE page_views       ALTER COLUMN env DROP DEFAULT;
ALTER TABLE contact_requests ALTER COLUMN env DROP DEFAULT;
ALTER TABLE reaction_events  ALTER COLUMN env DROP DEFAULT;

-- The public-facing reads filter by env, so staging traffic never inflates the
-- numbers shown on the production site.
CREATE INDEX IF NOT EXISTS page_views_env_page_idx      ON page_views (env, page);
CREATE INDEX IF NOT EXISTS reaction_events_env_page_idx ON reaction_events (env, page, reaction);

-- visits_weekly gains an env parameter (see 006 for the original). Dropped and
-- recreated rather than overloaded, so only one signature exists.
DROP FUNCTION IF EXISTS visits_weekly(TEXT);

CREATE OR REPLACE FUNCTION visits_weekly(p_page TEXT, p_env SMALLINT)
RETURNS TABLE (week DATE, views BIGINT)
LANGUAGE sql
STABLE
AS $$
  WITH counts AS (
    SELECT date_trunc('week', created_at) AS week, COUNT(*)::BIGINT AS views
    FROM page_views
    WHERE page = p_page AND env = p_env
    GROUP BY 1
  ),
  bounds AS (
    SELECT MIN(week) AS lo, date_trunc('week', NOW()) AS hi FROM counts
  ),
  series AS (
    SELECT generate_series(
      (SELECT lo FROM bounds),
      (SELECT hi FROM bounds),
      INTERVAL '1 week'
    ) AS week
  )
  SELECT s.week::DATE AS week, COALESCE(c.views, 0) AS views
  FROM series s
  LEFT JOIN counts c USING (week)
  ORDER BY s.week;
$$;
