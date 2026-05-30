-- Add geo columns to sessions (run this if you already applied 001_visits.sql)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS country   CHAR(2);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS continent CHAR(2);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS city      TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS timezone  TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS asorg     TEXT;
