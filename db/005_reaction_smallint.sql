-- Shrink reaction_events.reaction from TEXT to SMALLINT to save space.
--   1 = valuable, 2 = not_valuable
-- The edge function maps the public string names to/from these codes.
-- Table is empty at migration time; the USING clause covers any stray rows.

ALTER TABLE reaction_events DROP CONSTRAINT IF EXISTS reaction_events_reaction_check;

ALTER TABLE reaction_events
  ALTER COLUMN reaction TYPE SMALLINT
  USING (CASE reaction WHEN 'valuable' THEN 1 WHEN 'not_valuable' THEN 2 END);

ALTER TABLE reaction_events
  ADD CONSTRAINT reaction_events_reaction_check CHECK (reaction IN (1, 2));
