-- migration-mode: online

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ind_rp_statuses__individual_id_id
  ON individual_rewards_program_statuses (individual_id, id);

DROP INDEX CONCURRENTLY IF EXISTS individual_rewards_program_statuses__individual_id;
