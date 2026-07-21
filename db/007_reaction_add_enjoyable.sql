-- Widen reaction_events.reaction to allow a third reaction code.
--   1 = informative, 2 = helpful, 3 = enjoyable
-- The edge function stays agnostic to the meaning; the article HTML/JS owns the
-- labels. Codes 1 and 2 were previously valuable / not_valuable and are reused.

ALTER TABLE reaction_events DROP CONSTRAINT IF EXISTS reaction_events_reaction_check;

ALTER TABLE reaction_events
  ADD CONSTRAINT reaction_events_reaction_check CHECK (reaction IN (1, 2, 3));
