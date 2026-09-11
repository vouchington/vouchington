CREATE OR REPLACE VIEW view_current_paid_memberships AS
  SELECT DISTINCT ON (m.user_id)
    m.user_id,
    product.plan
  FROM memberships m
  INNER JOIN membership_products product ON product.id = m.membership_product_id
  INNER JOIN membership_sources source ON source.id = m.membership_source_id
  LEFT JOIN membership_source_states source_state
    ON source_state.membership_source_id = source.id
  LEFT JOIN membership_provider_observations observation
    ON observation.id = source_state.membership_provider_observation_id
  LEFT JOIN membership_provider_evidence_records evidence
    ON evidence.id = observation.membership_provider_evidence_id
  WHERE m.projection_ended_at IS NULL
    AND m.cancelled_at IS NULL
    AND m.expired_at IS NULL
    AND m.paused_at IS NULL
    AND (
      source.source_kind = 'direct'
      OR m.expires_at IS NULL
      OR m.expires_at > CURRENT_TIMESTAMP
    )
    AND (
      source.source_kind <> 'family'
      OR (
        source_state.cancelled_at IS NULL
        AND source_state.expired_at IS NULL
        AND source_state.past_due_at IS NULL
        AND source_state.paused_at IS NULL
        AND source_state.effective_at <= CURRENT_TIMESTAMP
        AND (source_state.expires_at IS NULL OR source_state.expires_at > CURRENT_TIMESTAMP)
        AND evidence.verified_at IS NOT NULL
        AND evidence.rejected_at IS NULL
      )
    )
  ORDER BY
    m.user_id,
    CASE product.plan
      WHEN 'pro' THEN 3
      WHEN 'plus' THEN 2
    END DESC,
    m.id DESC;
