-- Contact requests: submissions from the contact page form
--
-- Written by the submit-contact edge function (service role). Like the other
-- tables, RLS is enabled with no policies, so direct anon/authenticated access
-- is rejected.
--
-- session_token is a soft link to sessions (no FK): a submission may arrive
-- before the session row exists or with tracking blocked, and pruning sessions
-- should never block writes here. IP / user-agent are intentionally NOT stored
-- — join to sessions on session_token when that context is needed.

CREATE TABLE IF NOT EXISTS contact_requests (
  id             BIGSERIAL    PRIMARY KEY,
  name           TEXT         NOT NULL,
  surname        TEXT         NOT NULL,
  email          TEXT         NOT NULL,
  looking_for    TEXT         NOT NULL
                   CHECK (looking_for IN ('build-unblock', 'mentoring', 'website', 'math')),
  note           TEXT,
  session_token  UUID,                  -- soft link to sessions(session_token); may be NULL
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contact_requests_created_at_idx ON contact_requests (created_at DESC);

-- Deny all direct access; the edge function connects as service role
ALTER TABLE contact_requests ENABLE ROW LEVEL SECURITY;
