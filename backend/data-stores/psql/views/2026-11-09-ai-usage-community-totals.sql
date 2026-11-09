-- Lifetime provider-call totals per community: the retained raw tail plus the monthly rollups
-- that retention folded out of it. Each fold page adds its rollup and deletes its raw rows in one
-- transaction, so the two sources never count the same call. Communities deleted since the last
-- refresh are filtered by the read path so eligibility stays live.
-- squawk-ignore ban-drop-view -- PostgreSQL cannot replace a materialized view in place.
DROP MATERIALIZED VIEW IF EXISTS mv_ai_usage_community_totals;

CREATE MATERIALIZED VIEW mv_ai_usage_community_totals AS
WITH usage_totals AS (
  SELECT
    community_id,
    COUNT(*)::NUMERIC AS request_count,
    SUM(input_tokens)::NUMERIC AS input_tokens,
    SUM(output_tokens)::NUMERIC AS output_tokens,
    (COUNT(*) FILTER (WHERE pricing_status = 'unpriced'))::NUMERIC AS unpriced_request_count,
    COALESCE(SUM(cost_microunits), 0)::NUMERIC AS cost_microunits
  FROM ai_usage_records
  WHERE community_id IS NOT NULL
  GROUP BY community_id
  UNION ALL
  SELECT
    community_id,
    SUM(request_count)::NUMERIC,
    SUM(input_tokens)::NUMERIC,
    SUM(output_tokens)::NUMERIC,
    SUM(unpriced_request_count)::NUMERIC,
    SUM(cost_microunits)::NUMERIC
  FROM ai_usage_community_monthly_rollups
  GROUP BY community_id
)
SELECT
  community_id,
  SUM(request_count) AS request_count,
  SUM(input_tokens) AS input_tokens,
  SUM(output_tokens) AS output_tokens,
  SUM(unpriced_request_count) AS unpriced_request_count,
  SUM(cost_microunits) AS cost_microunits
FROM usage_totals
GROUP BY community_id;

CREATE UNIQUE INDEX idx_mv_ai_usage_community_totals__community_id
  ON mv_ai_usage_community_totals (community_id);
CREATE INDEX idx_mv_ai_usage_community_totals__ranking
  ON mv_ai_usage_community_totals (cost_microunits DESC, community_id DESC);
COMMENT ON MATERIALIZED VIEW mv_ai_usage_community_totals IS 'Lifetime AI provider-call totals per community from retained raw calls and folded monthly rollups, refreshed on the PostgreSQL materialized-view schedule.';
