-- Current membership counts and observed Stripe revenue, grouped for global and scoped reads.
-- Empty application_id denotes the context-independent active-membership count.
-- squawk-ignore ban-drop-view -- PostgreSQL cannot replace a materialized view in place.
DROP MATERIALIZED VIEW IF EXISTS mv_revenue_memberships;

CREATE MATERIALIZED VIEW mv_revenue_memberships AS
WITH eligible_memberships AS (
  SELECT m.user_id, product.plan AS tier, product.billing_interval AS interval,
    m.membership_source_id, m.membership_product_id
  FROM memberships m
  JOIN view_current_paid_memberships current_paid ON current_paid.user_id = m.user_id
  JOIN membership_products product ON product.id = m.membership_product_id
  WHERE m.projection_ended_at IS NULL
    AND m.cancelled_at IS NULL AND m.expired_at IS NULL
    AND m.past_due_at IS NULL AND m.paused_at IS NULL
), active_counts AS (
  SELECT user_id, tier, COUNT(*)::INT AS membership_count
  FROM eligible_memberships GROUP BY user_id, tier
), revenue_counts AS (
  SELECT eligible.user_id, eligible.tier, eligible.interval,
    observation.observed_price_currency_code AS currency_code,
    currency.minor_unit_exponent,
    provider_context.application_id,
    COUNT(*)::INT AS membership_count,
    SUM(observation.observed_price_minor_units)::NUMERIC AS total_minor_units
  FROM eligible_memberships eligible
  JOIN membership_sources source ON source.id = eligible.membership_source_id
    AND source.source_kind = 'direct'
  JOIN membership_source_states state
    ON state.membership_source_id = source.id
    AND state.membership_product_id = eligible.membership_product_id
  JOIN membership_provider_observations observation
    ON observation.id = state.membership_provider_observation_id
  JOIN membership_provider_contexts provider_context
    ON provider_context.id = observation.membership_provider_context_id
    AND provider_context.provider = 'stripe'
    AND provider_context.environment = 'production'
  JOIN currencies currency ON currency.code = observation.observed_price_currency_code
  GROUP BY eligible.user_id, eligible.tier, eligible.interval,
    observation.observed_price_currency_code, currency.minor_unit_exponent,
    provider_context.application_id
), scoped_rows AS (
  SELECT user_id::TEXT AS scope_id, ''::TEXT AS application_id, tier,
    NULL::TEXT AS interval, NULL::TEXT AS currency_code,
    NULL::INT AS minor_unit_exponent, membership_count,
    NULL::NUMERIC AS total_minor_units
  FROM active_counts
  UNION ALL
  SELECT user_id::TEXT, application_id, tier, interval::TEXT,
    currency_code::TEXT, minor_unit_exponent, membership_count, total_minor_units
  FROM revenue_counts
)
SELECT scope_id, application_id, tier, interval, currency_code, minor_unit_exponent,
  membership_count, total_minor_units
FROM scoped_rows
UNION ALL
SELECT '00000000-0000-0000-0000-000000000000'::TEXT, application_id,
  tier, interval, currency_code, minor_unit_exponent,
  SUM(membership_count)::INT, SUM(total_minor_units)
FROM scoped_rows
GROUP BY application_id, tier, interval, currency_code, minor_unit_exponent;

CREATE UNIQUE INDEX idx_mv_revenue_memberships__key ON mv_revenue_memberships
  (scope_id, application_id, tier, interval, currency_code) NULLS NOT DISTINCT;
COMMENT ON MATERIALIZED VIEW mv_revenue_memberships IS 'Active memberships and exact observed direct Stripe revenue for global and per-user reads.';
