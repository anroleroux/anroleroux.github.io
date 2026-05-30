-- Visit tracking: sessions, page views, and rate limiting
--
-- Design:
--   sessions    — one row per browser (keyed by localStorage UUID)
--   page_views  — one row per page load
--   rate_limits — sliding-window IP-hash entries; aged out by the edge function
--
-- The edge function uses the service role key; no direct client access is
-- needed. RLS is enabled on all tables and no policies are granted, so
-- direct anon/authenticated requests are rejected.

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  session_token  UUID         PRIMARY KEY,
  user_id        UUID         REFERENCES auth.users(id) ON DELETE SET NULL,  -- nullable; populated on future auth
  ip_hash        TEXT         NOT NULL,
  country        CHAR(2),               -- ISO 3166-1 alpha-2 from cf-ipcountry; NULL if unknown
  continent      CHAR(2),               -- cf-ipcontinent
  city           TEXT,                  -- cf-ipcity
  latitude       DOUBLE PRECISION,      -- cf-iplatitude  (city-level)
  longitude      DOUBLE PRECISION,      -- cf-iplongitude (city-level)
  timezone       TEXT,                  -- cf-timezone (IANA)
  asorg          TEXT,                  -- cf-asorganization (ISP / org; useful for bot filtering)
  user_agent     TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_seen      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx    ON sessions (user_id)    WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sessions_created_at_idx ON sessions (created_at);

-- Page views
CREATE TABLE IF NOT EXISTS page_views (
  id             BIGSERIAL    PRIMARY KEY,
  session_token  UUID         NOT NULL REFERENCES sessions(session_token) ON DELETE CASCADE,
  page           TEXT         NOT NULL DEFAULT '/',
  referrer       TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS page_views_session_idx    ON page_views (session_token);
CREATE INDEX IF NOT EXISTS page_views_created_at_idx ON page_views (created_at);
CREATE INDEX IF NOT EXISTS page_views_page_idx       ON page_views (page);

-- Rate limits (sliding window; rows older than 2 min are pruned by the edge function)
CREATE TABLE IF NOT EXISTS rate_limits (
  id          BIGSERIAL    PRIMARY KEY,
  ip_hash     TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rate_limits_ip_created_idx ON rate_limits (ip_hash, created_at);

-- Deny all direct access; the edge function connects as service role
ALTER TABLE sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_views  ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
