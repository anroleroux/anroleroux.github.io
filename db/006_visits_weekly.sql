-- Weekly visit series for a single page (drives the article meta-bar sparkline)
--
-- page_views is RLS-locked with no policies, so the browser cannot read it. The
-- `visits` edge function calls this function as service role and returns the
-- series to the client. Buckets are ISO weeks (Monday-start, date_trunc's
-- default) and the range is zero-filled from the first week with a view to the
-- current week, so the line has no gaps.

CREATE OR REPLACE FUNCTION visits_weekly(p_page TEXT)
RETURNS TABLE (week DATE, views BIGINT)
LANGUAGE sql
STABLE
AS $$
  WITH counts AS (
    SELECT date_trunc('week', created_at) AS week, COUNT(*)::BIGINT AS views
    FROM page_views
    WHERE page = p_page
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
