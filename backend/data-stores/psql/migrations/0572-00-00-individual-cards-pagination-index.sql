-- migration-mode: online

-- The composite name was briefly substituted into migration 0065. Drop either shape so
-- databases that applied either historical definition converge on the same pagination index.
DROP INDEX CONCURRENTLY IF EXISTS idx_individual_cards__individual_id_id;
DROP INDEX CONCURRENTLY IF EXISTS individual_cards__individual_id;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_individual_cards__individual_id_id
  ON individual_cards (individual_id, id);
