-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE VIEW view_user_metrics AS
  SELECT
    'user_metrics' AS __entity_type,
    id
  FROM user_metrics
;

COMMENT ON VIEW view_user_metrics IS 'User activity metrics for public profile reads.';
