import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function prepareRenewalPriceIncreaseNotification(
  membershipId: string,
  userId: string,
  membershipProviderObservationId: string,
): Promise<string | null> {
  const { rows } = await write<{
    generation: string
  }>(sql`/* prepareRenewalPriceIncreaseNotification */
    WITH candidate AS (
      SELECT m.id AS membership_id, observation.id AS membership_provider_observation_id,
        observation.renewal_membership_provider_product_id AS membership_provider_product_id,
        observation.renewal_price_minor_units AS price_minor_units,
        observation.renewal_price_currency_code AS currency_code,
        observation.renewal_effective_at AS effective_at
    FROM memberships m
    CROSS JOIN membership_source_states state
    INNER JOIN membership_provider_observations observation
      ON observation.id = state.membership_provider_observation_id
      AND observation.membership_provider_lineage_id = state.membership_provider_lineage_id
      AND observation.membership_product_id = state.membership_product_id
      AND observation.source_kind = 'direct' AND observation.should_auto_renew = true
    INNER JOIN membership_provider_evidence_records evidence
      ON evidence.id = observation.membership_provider_evidence_record_id
      AND evidence.verified_at IS NOT NULL AND evidence.rejected_at IS NULL
    INNER JOIN membership_products current_product
      ON current_product.id = state.membership_product_id
    INNER JOIN membership_products renewal_product
      ON renewal_product.id = observation.renewal_membership_product_id
      AND renewal_product.plan = current_product.plan
      AND renewal_product.billing_interval = current_product.billing_interval
    WHERE m.id = ${membershipId} AND m.user_id = ${userId}
      AND observation.id = ${membershipProviderObservationId}
      AND state.membership_source_id = m.membership_source_id
      AND state.membership_product_id = m.membership_product_id
      AND state.source_kind = 'direct' AND state.should_auto_renew = true
      AND state.cancelled_at IS NULL AND state.past_due_at IS NULL
      AND state.expires_at > CURRENT_TIMESTAMP
      AND observation.cancelled_at IS NULL AND observation.past_due_at IS NULL
      AND observation.expires_at > CURRENT_TIMESTAMP
      AND m.projection_ended_at IS NULL AND m.cancelled_at IS NULL
      AND m.expired_at IS NULL AND m.past_due_at IS NULL AND m.paused_at IS NULL
      AND m.should_cancel_at_period_end = false
      AND m.expires_at > CURRENT_TIMESTAMP
      AND observation.renewal_effective_at > CURRENT_TIMESTAMP
      AND observation.renewal_effective_at <= CURRENT_TIMESTAMP + INTERVAL '30 days'
      AND observation.renewal_price_currency_code = observation.observed_price_currency_code
      AND observation.renewal_price_minor_units > observation.observed_price_minor_units
      FOR UPDATE OF m
    )
    INSERT INTO membership_renewal_price_increase_notification_work_items AS work (
      membership_id, membership_provider_observation_id, membership_provider_product_id,
      price_minor_units, currency_code, effective_at
    ) SELECT membership_id, membership_provider_observation_id, membership_provider_product_id,
      price_minor_units, currency_code, effective_at FROM candidate
    ORDER BY membership_id ASC NULLS LAST
    ON CONFLICT (membership_id) DO UPDATE SET
      membership_provider_observation_id = EXCLUDED.membership_provider_observation_id,
      membership_provider_product_id = EXCLUDED.membership_provider_product_id,
      price_minor_units = EXCLUDED.price_minor_units, currency_code = EXCLUDED.currency_code,
      effective_at = EXCLUDED.effective_at,
      generation = work.generation + CASE WHEN ROW(work.membership_provider_observation_id,
        work.membership_provider_product_id, work.price_minor_units, work.currency_code, work.effective_at)
        IS DISTINCT FROM ROW(EXCLUDED.membership_provider_observation_id,
          EXCLUDED.membership_provider_product_id, EXCLUDED.price_minor_units, EXCLUDED.currency_code, EXCLUDED.effective_at)
        THEN 1 ELSE 0 END,
      attempt_count = CASE WHEN work.membership_provider_observation_id IS DISTINCT FROM EXCLUDED.membership_provider_observation_id
        THEN 0 ELSE work.attempt_count END,
      lease_token = NULL, leased_at = NULL, lease_expires_at = NULL,
      delivery_attempted_at = NULL, completed_at = NULL, available_at = clock_timestamp()
    WHERE (
      ROW(work.membership_provider_product_id, work.price_minor_units, work.currency_code, work.effective_at)
      IS DISTINCT FROM ROW(EXCLUDED.membership_provider_product_id, EXCLUDED.price_minor_units,
        EXCLUDED.currency_code, EXCLUDED.effective_at)
      AND (work.lease_token IS NULL OR work.lease_expires_at <= clock_timestamp() )
    ) OR (work.completed_at IS NULL AND work.delivery_attempted_at IS NULL
      AND (work.lease_token IS NULL OR work.lease_expires_at <= clock_timestamp()))
    RETURNING generation::text
  `)
  return rows[0]?.generation ?? null
}
