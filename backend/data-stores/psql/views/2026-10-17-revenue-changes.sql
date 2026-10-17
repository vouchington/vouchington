-- Fixed dashboard windows are grouped at refresh time, including the all-time window.
-- squawk-ignore ban-drop-view -- PostgreSQL cannot replace a materialized view in place.
DROP MATERIALIZED VIEW IF EXISTS mv_revenue_changes;

CREATE MATERIALIZED VIEW mv_revenue_changes AS
WITH windows AS (
  SELECT window_name, cutoff_id FROM (VALUES
    ('today'::TEXT, fn_min_uuidv7(DATE_TRUNC('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')),
    ('7d'::TEXT, fn_min_uuidv7(CURRENT_TIMESTAMP - INTERVAL '7 days')),
    ('30d'::TEXT, fn_min_uuidv7(CURRENT_TIMESTAMP - INTERVAL '30 days')),
    ('90d'::TEXT, fn_min_uuidv7(CURRENT_TIMESTAMP - INTERVAL '90 days')),
    ('all'::TEXT, '00000000-0000-0000-0000-000000000000'::UUID)
  ) AS value(window_name, cutoff_id)
), scoped AS (
  SELECT windows.window_name, changes.user_id::TEXT AS scope_id,
    COUNT(*) FILTER (WHERE changes.change_type = 'upgrade')::INT AS upgrades,
    COUNT(*) FILTER (WHERE changes.change_type = 'downgrade')::INT AS downgrades,
    COUNT(*) FILTER (WHERE changes.change_type = 'cancellation')::INT AS cancellations
  FROM windows
  JOIN membership_changes changes ON changes.id > windows.cutoff_id
  GROUP BY windows.window_name, changes.user_id
)
SELECT window_name, scope_id, upgrades, downgrades, cancellations FROM scoped
UNION ALL
SELECT window_name, '00000000-0000-0000-0000-000000000000'::TEXT,
  SUM(upgrades)::INT, SUM(downgrades)::INT, SUM(cancellations)::INT
FROM scoped GROUP BY window_name;

CREATE UNIQUE INDEX idx_mv_revenue_changes__key ON mv_revenue_changes (window_name, scope_id);
COMMENT ON MATERIALIZED VIEW mv_revenue_changes IS 'Upgrade, downgrade and cancellation counts by fixed dashboard window and user, refreshed on schedule.';
