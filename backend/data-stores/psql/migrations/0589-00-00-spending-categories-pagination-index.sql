-- migration-mode: online

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_spending_entries__individual_id_id
  ON spending_entries (individual_id, id)
  WHERE individual_id IS NOT NULL;

DROP INDEX CONCURRENTLY IF EXISTS spending_entries__individual_id;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_spending_entries__household_id_id
  ON spending_entries (household_id, id)
  WHERE household_id IS NOT NULL;

DROP INDEX CONCURRENTLY IF EXISTS spending_entries__household_id;
