-- migration-mode: online

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ind_rp_point_valuations__individual_id_id
  ON individual_rewards_program_point_valuations (individual_id, id);
