import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function markRenewalPriceIncreaseNotificationDeliveryAttempted(
  membershipId: string,
  userId: string,
  membershipProviderObservationId: string,
  claimToken: string,
): Promise<boolean> {
  const { rows } = await write(sql`/* markRenewalPriceIncreaseNotificationDeliveryAttempted */
    WITH target AS MATERIALIZED (
      SELECT candidate.id
      FROM memberships original
      CROSS JOIN LATERAL (
        SELECT projection.id
        FROM memberships projection
        WHERE projection.membership_source_id = original.membership_source_id
          AND projection.renewal_price_increase_claim_token = ${claimToken}
        ORDER BY projection.projection_ended_at IS NULL DESC,
          projection.projection_ended_at DESC NULLS LAST, projection.id DESC
        LIMIT 1
      ) candidate
      WHERE original.id = ${membershipId}
      LIMIT 1
    )
    UPDATE memberships m SET renewal_price_increase_delivery_attempted_at = CURRENT_TIMESTAMP
    FROM target, membership_source_states state
    INNER JOIN membership_provider_observations observation
      ON observation.id = state.membership_provider_observation_id
      AND observation.membership_provider_lineage_id = state.membership_provider_lineage_id
      AND observation.membership_product_id = state.membership_product_id
      AND observation.source_kind = 'direct' AND observation.auto_renews = true
    INNER JOIN membership_provider_evidence_records evidence
      ON evidence.id = observation.membership_provider_evidence_id
      AND evidence.verified_at IS NOT NULL AND evidence.rejected_at IS NULL
    INNER JOIN membership_products current_product
      ON current_product.id = state.membership_product_id
    INNER JOIN membership_products renewal_product
      ON renewal_product.id = observation.renewal_membership_product_id
      AND renewal_product.plan = current_product.plan
      AND renewal_product.billing_interval = current_product.billing_interval
    WHERE m.id = target.id AND m.user_id = ${userId}
      AND m.renewal_price_increase_notified_observation_id = ${membershipProviderObservationId}
      AND m.renewal_price_increase_claim_token = ${claimToken}
      AND observation.id = ${membershipProviderObservationId}
      AND state.membership_source_id = m.membership_source_id
      AND state.membership_product_id = m.membership_product_id
      AND state.source_kind = 'direct' AND state.auto_renews = true
      AND state.cancelled_at IS NULL AND state.past_due_at IS NULL
      AND state.expires_at > CURRENT_TIMESTAMP
      AND observation.cancelled_at IS NULL AND observation.past_due_at IS NULL
      AND observation.expires_at > CURRENT_TIMESTAMP
      AND m.cancelled_at IS NULL
      AND m.expired_at IS NULL AND m.past_due_at IS NULL AND m.paused_at IS NULL
      AND m.cancel_at_period_end = false AND m.expires_at > CURRENT_TIMESTAMP
      AND observation.renewal_effective_at > CURRENT_TIMESTAMP
      AND observation.renewal_effective_at <= CURRENT_TIMESTAMP + INTERVAL '30 days'
      AND observation.renewal_price_currency_code = observation.observed_price_currency_code
      AND observation.renewal_price_minor_units > observation.observed_price_minor_units
      AND m.renewal_price_increase_notified_provider_product_id = observation.renewal_membership_provider_product_id
      AND m.renewal_price_increase_notified_minor_units = observation.renewal_price_minor_units
      AND m.renewal_price_increase_notified_currency_code = observation.renewal_price_currency_code
      AND m.renewal_price_increase_notified_effective_at = observation.renewal_effective_at
      AND m.renewal_price_increase_notified_at IS NULL
      AND m.renewal_price_increase_delivery_attempted_at IS NULL
    RETURNING m.id
  `)
  return rows.length > 0
}

export async function markRenewalPriceIncreaseNotificationDelivered(
  membershipId: string,
  userId: string,
  membershipProviderObservationId: string,
  claimToken: string,
): Promise<boolean> {
  const { rows } = await write(sql`/* markRenewalPriceIncreaseNotificationDelivered */
    WITH target AS MATERIALIZED (
      SELECT candidate.id
      FROM memberships original
      CROSS JOIN LATERAL (
        SELECT projection.id
        FROM memberships projection
        WHERE projection.membership_source_id = original.membership_source_id
          AND projection.renewal_price_increase_claim_token = ${claimToken}
        ORDER BY projection.projection_ended_at IS NULL DESC,
          projection.projection_ended_at DESC NULLS LAST, projection.id DESC
        LIMIT 1
      ) candidate
      WHERE original.id = ${membershipId}
      LIMIT 1
    )
    UPDATE memberships SET renewal_price_increase_notified_at = CURRENT_TIMESTAMP,
      renewal_price_increase_claim_token = NULL, renewal_price_increase_claimed_at = NULL
    FROM target
    WHERE memberships.id = target.id AND memberships.user_id = ${userId}
      AND renewal_price_increase_notified_observation_id = ${membershipProviderObservationId}
      AND renewal_price_increase_claim_token = ${claimToken}
      AND renewal_price_increase_notified_at IS NULL
      AND renewal_price_increase_delivery_attempted_at IS NOT NULL
    RETURNING memberships.id
  `)
  return rows.length > 0
}

export async function releaseRenewalPriceIncreaseNotification(
  membershipId: string,
  userId: string,
  membershipProviderObservationId: string,
  claimToken: string,
): Promise<void> {
  await write(sql`/* releaseRenewalPriceIncreaseNotification */
    WITH target AS MATERIALIZED (
      SELECT candidate.id
      FROM memberships original
      CROSS JOIN LATERAL (
        SELECT projection.id
        FROM memberships projection
        WHERE projection.membership_source_id = original.membership_source_id
          AND projection.renewal_price_increase_claim_token = ${claimToken}
        ORDER BY projection.projection_ended_at IS NULL DESC,
          projection.projection_ended_at DESC NULLS LAST, projection.id DESC
        LIMIT 1
      ) candidate
      WHERE original.id = ${membershipId}
      LIMIT 1
    )
    UPDATE memberships SET renewal_price_increase_notified_observation_id = NULL,
      renewal_price_increase_notified_provider_product_id = NULL,
      renewal_price_increase_notified_minor_units = NULL,
      renewal_price_increase_notified_currency_code = NULL,
      renewal_price_increase_notified_effective_at = NULL,
      renewal_price_increase_notified_at = NULL,
      renewal_price_increase_claim_token = NULL,
      renewal_price_increase_claimed_at = NULL,
      renewal_price_increase_delivery_attempted_at = NULL
    FROM target
    WHERE memberships.id = target.id AND memberships.user_id = ${userId}
      AND renewal_price_increase_notified_observation_id = ${membershipProviderObservationId}
      AND renewal_price_increase_claim_token = ${claimToken}
      AND renewal_price_increase_notified_at IS NULL
      AND renewal_price_increase_delivery_attempted_at IS NULL
  `)
}
