-- All-time active-link counts for enabled referral programs. The count is refreshed on the
-- PostgreSQL materialized-view schedule, so link and program mutations become visible at refresh.
-- squawk-ignore ban-drop-view -- PostgreSQL cannot replace a materialized view in place.
DROP MATERIALIZED VIEW IF EXISTS mv_referral_program_link_counts;

CREATE MATERIALIZED VIEW mv_referral_program_link_counts AS
SELECT
  program.topic_id,
  COUNT(link.id)::BIGINT AS active_link_count
FROM referral_program_topics program
LEFT JOIN user_referral_program_links link
  ON link.referral_program_topic_id = program.topic_id
  AND link.activated_at IS NOT NULL
  AND link.deleted_at IS NULL
WHERE program.enabled_at IS NOT NULL
  AND program.disabled_at IS NULL
GROUP BY program.topic_id;

CREATE UNIQUE INDEX idx_mv_referral_program_link_counts__topic_id
  ON mv_referral_program_link_counts (topic_id);
CREATE INDEX idx_mv_referral_program_link_counts__count__topic_id
  ON mv_referral_program_link_counts (active_link_count DESC, topic_id DESC)
  WHERE active_link_count > 0;

COMMENT ON MATERIALIZED VIEW mv_referral_program_link_counts IS
  'All-time active referral-link counts for enabled programs, refreshed on the PostgreSQL materialized-view schedule; topic deletion and merge are checked by readers.';
COMMENT ON COLUMN mv_referral_program_link_counts.topic_id IS
  'Enabled referral program topic.';
COMMENT ON COLUMN mv_referral_program_link_counts.active_link_count IS
  'Number of active links, including zero, at the last materialized-view refresh.';
