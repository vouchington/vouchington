CREATE OR REPLACE VIEW view_memberships AS
  SELECT
    'membership' AS __entity_type,
    m.id,
    m.user_id,
    p.plan,
    CASE
      WHEN m.cancelled_at IS NOT NULL THEN 'cancelled'
      WHEN m.expired_at IS NOT NULL THEN 'expired'
      WHEN source.source_kind = 'family' AND (
        source_state.cancelled_at IS NOT NULL
        OR source_state.expired_at IS NOT NULL
        OR source_state.past_due_at IS NOT NULL
        OR source_state.paused_at IS NOT NULL
        OR source_state.effective_at > NOW()
        OR source_state.expires_at <= NOW()
        OR evidence.verified_at IS NULL
        OR evidence.rejected_at IS NOT NULL
      ) THEN 'expired'
      WHEN source.source_kind IN ('family', 'admin_grant')
        AND m.expires_at IS NOT NULL
        AND m.expires_at <= NOW() THEN 'expired'
      WHEN m.past_due_at IS NOT NULL THEN 'past_due'
      WHEN m.paused_at IS NOT NULL THEN 'paused'
      ELSE 'active'
    END AS status,
    m.effective_at AS started_at,
    m.expires_at,
    CASE WHEN lineage.provider = 'stripe' AND source.source_kind = 'direct' THEN lineage.provider_lineage_id END AS stripe_subscription_id,
    CASE WHEN lineage.provider = 'stripe' AND source.source_kind = 'direct' THEN lineage.provider_account_id END AS stripe_customer_id,
    membership_grant.granted_by_id,
    m.cancelled_at,
    m.expired_at,
    m.past_due_at,
    m.paused_at,
    m.cancel_at_period_end,
    m.latest_change_id,
    m.created_at,
    m.updated_at,

    json_build_object(
      'id', p.id,
      'plan', p.plan,
      'price', CASE
        WHEN stripe_mapping.provider_product_id IS NULL THEN NULL
        ELSE json_build_object(
          'amount', stripe_mapping.price_minor_units,
          'currency', stripe_mapping.currency_code
        )
      END,
      'interval', p.billing_interval,
      'stripe_price_id', stripe_mapping.provider_product_id,
      'retired_at', p.retired_at
    ) AS sku

  FROM memberships m
  INNER JOIN membership_products p ON p.id = m.membership_product_id
  INNER JOIN membership_sources source ON source.id = m.membership_source_id
  LEFT JOIN membership_source_states source_state
    ON source_state.membership_source_id = source.id
  LEFT JOIN membership_provider_observations observation
    ON observation.id = source_state.membership_provider_observation_id
  LEFT JOIN membership_provider_evidence_records evidence
    ON evidence.id = observation.membership_provider_evidence_id
  LEFT JOIN membership_grants membership_grant ON membership_grant.membership_source_id = source.id
  LEFT JOIN membership_provider_lineages lineage ON lineage.id = source.membership_provider_lineage_id
  LEFT JOIN LATERAL (
    SELECT provider_product_id, price_minor_units, currency_code
    FROM membership_provider_products
    WHERE membership_product_id = p.id
      AND provider = 'stripe'
      AND source.source_kind <> 'admin_grant'
      AND (
        (source.source_kind = 'direct' AND lineage.provider = 'stripe' AND environment = lineage.environment)
        OR source.source_kind <> 'direct'
      )
      AND application_id = CASE
        WHEN source.source_kind = 'direct' AND lineage.provider = 'stripe' THEN lineage.application_id
        ELSE 'voucha-web'
      END
    ORDER BY id DESC
    LIMIT 1
  ) stripe_mapping ON true
  WHERE m.projection_ended_at IS NULL
;
