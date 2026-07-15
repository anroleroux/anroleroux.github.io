-- Article reactions: append-only "valuable" / "not valuable" clicks
--
-- Design mirrors page_views:
--   reaction_events — one row per accepted click (applause-style, unlimited)
--
-- Counts shown to visitors are COUNT(*) over this table. The same table feeds
-- the per-session throttle in the edge function (recent rows for a session+page).
--
-- The edge function uses the service role key; RLS is enabled with no policies,
-- so direct anon/authenticated access is rejected (same as sessions/page_views).

CREATE TABLE IF NOT EXISTS reaction_events (
  id             BIGSERIAL    PRIMARY KEY,
  session_token  UUID         NOT NULL,
  page           TEXT         NOT NULL,
  reaction       TEXT         NOT NULL CHECK (reaction IN ('valuable', 'not_valuable')),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Fast COUNT(*) per page + reaction (display)
CREATE INDEX IF NOT EXISTS reaction_events_page_reaction_idx
  ON reaction_events (page, reaction);

-- Sliding-window throttle lookup by session + page
CREATE INDEX IF NOT EXISTS reaction_events_session_page_created_idx
  ON reaction_events (session_token, page, created_at);

-- Deny all direct access; the edge function connects as service role
ALTER TABLE reaction_events ENABLE ROW LEVEL SECURITY;
