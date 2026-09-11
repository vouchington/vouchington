import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  renewalPriceIncreaseUser,
  type RenewalPriceIncreaseUser,
} from './renewal-price-increase-user.mts'

export async function getUsersApproachingRenewalWithPriceIncrease(): Promise<
  RenewalPriceIncreaseUser[]
> {
  const { rows } = await read(sql`/* getUsersApproachingRenewalWithPriceIncrease */
    SELECT m.user_id, m.id AS membership_id,
      observation.id AS membership_provider_observation_id,
      observation.observed_price_minor_units AS current_price_minor_units,
      observation.renewal_price_minor_units AS new_price_minor_units,
      observation.observed_price_currency_code AS currency_code,
      product.plan, product.billing_interval AS interval,
      observation.renewal_effective_at AS expires_at
    FROM memberships m
    INNER JOIN membership_source_states state
      ON state.membership_source_id = m.membership_source_id
      AND state.membership_product_id = m.membership_product_id
      AND state.source_kind = 'direct'
    INNER JOIN membership_provider_observations observation
      ON observation.id = state.membership_provider_observation_id
      AND observation.membership_provider_lineage_id = state.membership_provider_lineage_id
      AND observation.membership_product_id = state.membership_product_id
      AND observation.source_kind = 'direct' AND observation.auto_renews = true
    INNER JOIN membership_provider_evidence_records evidence
      ON evidence.id = observation.membership_provider_evidence_id
      AND evidence.verified_at IS NOT NULL AND evidence.rejected_at IS NULL
    INNER JOIN membership_products product ON product.id = m.membership_product_id
    INNER JOIN membership_products renewal_product
      ON renewal_product.id = observation.renewal_membership_product_id
      AND renewal_product.plan = product.plan
      AND renewal_product.billing_interval = product.billing_interval
    WHERE m.projection_ended_at IS NULL
      AND state.auto_renews = true AND state.cancelled_at IS NULL
      AND state.past_due_at IS NULL AND state.expires_at > CURRENT_TIMESTAMP
      AND observation.cancelled_at IS NULL AND observation.past_due_at IS NULL
      AND observation.expires_at > CURRENT_TIMESTAMP
      AND m.cancelled_at IS NULL
      AND m.expired_at IS NULL
      AND m.past_due_at IS NULL
      AND m.paused_at IS NULL
      AND m.cancel_at_period_end = false
      AND m.expires_at > CURRENT_TIMESTAMP
      AND observation.renewal_effective_at > CURRENT_TIMESTAMP
      AND observation.renewal_effective_at <= CURRENT_TIMESTAMP + INTERVAL '30 days'
      AND observation.renewal_price_currency_code = observation.observed_price_currency_code
      AND observation.renewal_price_minor_units > observation.observed_price_minor_units
      AND (
        ((m.renewal_price_increase_claimed_at IS NULL
          OR m.renewal_price_increase_delivery_attempted_at IS NOT NULL
          OR m.renewal_price_increase_claimed_at < CURRENT_TIMESTAMP - INTERVAL '1 hour') AND
          (m.renewal_price_increase_notified_provider_product_id,
          m.renewal_price_increase_notified_minor_units,
          m.renewal_price_increase_notified_currency_code,
          m.renewal_price_increase_notified_effective_at)
        IS DISTINCT FROM
        (observation.renewal_membership_provider_product_id,
          observation.renewal_price_minor_units,
          observation.renewal_price_currency_code,
          observation.renewal_effective_at))
        OR (m.renewal_price_increase_notified_at IS NULL
          AND m.renewal_price_increase_delivery_attempted_at IS NULL
          AND (m.renewal_price_increase_claimed_at IS NULL
            OR m.renewal_price_increase_claimed_at < CURRENT_TIMESTAMP - INTERVAL '1 hour'))
      )
  `)
  return rows.map(renewalPriceIncreaseUser)
}

export async function claimRenewalPriceIncreaseNotification(
  membershipId: string,
  userId: string,
  membershipProviderObservationId: string,
): Promise<string | null> {
  const { rows } = await write(sql`/* claimRenewalPriceIncreaseNotification */
    UPDATE memberships m
    SET renewal_price_increase_notified_observation_id = observation.id,
      renewal_price_increase_notified_provider_product_id = observation.renewal_membership_provider_product_id,
      renewal_price_increase_notified_minor_units = observation.renewal_price_minor_units,
      renewal_price_increase_notified_currency_code = observation.renewal_price_currency_code,
      renewal_price_increase_notified_effective_at = observation.renewal_effective_at,
      renewal_price_increase_notified_at = NULL,
      renewal_price_increase_claim_token = uuidv7(),
      renewal_price_increase_claimed_at = CURRENT_TIMESTAMP,
      renewal_price_increase_delivery_attempted_at = NULL
    FROM membership_source_states state
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
    WHERE m.id = ${membershipId} AND m.user_id = ${userId}
      AND observation.id = ${membershipProviderObservationId}
      AND state.membership_source_id = m.membership_source_id
      AND state.membership_product_id = m.membership_product_id
      AND state.source_kind = 'direct' AND state.auto_renews = true
      AND state.cancelled_at IS NULL AND state.past_due_at IS NULL
      AND state.expires_at > CURRENT_TIMESTAMP
      AND observation.cancelled_at IS NULL AND observation.past_due_at IS NULL
      AND observation.expires_at > CURRENT_TIMESTAMP
      AND m.projection_ended_at IS NULL AND m.cancelled_at IS NULL
      AND m.expired_at IS NULL AND m.past_due_at IS NULL AND m.paused_at IS NULL
      AND m.cancel_at_period_end = false
      AND m.expires_at > CURRENT_TIMESTAMP
      AND observation.renewal_effective_at > CURRENT_TIMESTAMP
      AND observation.renewal_effective_at <= CURRENT_TIMESTAMP + INTERVAL '30 days'
      AND observation.renewal_price_currency_code = observation.observed_price_currency_code
      AND observation.renewal_price_minor_units > observation.observed_price_minor_units
      AND (
        ((m.renewal_price_increase_claimed_at IS NULL
          OR m.renewal_price_increase_delivery_attempted_at IS NOT NULL
          OR m.renewal_price_increase_claimed_at < CURRENT_TIMESTAMP - INTERVAL '1 hour') AND
          (m.renewal_price_increase_notified_provider_product_id,
          m.renewal_price_increase_notified_minor_units,
          m.renewal_price_increase_notified_currency_code,
          m.renewal_price_increase_notified_effective_at)
        IS DISTINCT FROM
        (observation.renewal_membership_provider_product_id,
          observation.renewal_price_minor_units,
          observation.renewal_price_currency_code,
          observation.renewal_effective_at))
        OR (m.renewal_price_increase_notified_at IS NULL
          AND m.renewal_price_increase_delivery_attempted_at IS NULL
          AND (m.renewal_price_increase_claimed_at IS NULL
            OR m.renewal_price_increase_claimed_at < CURRENT_TIMESTAMP - INTERVAL '1 hour'))
      )
    RETURNING m.renewal_price_increase_claim_token
  `)
  return (
    (rows[0] as { renewal_price_increase_claim_token: string } | undefined)
      ?.renewal_price_increase_claim_token ?? null
  )
}
