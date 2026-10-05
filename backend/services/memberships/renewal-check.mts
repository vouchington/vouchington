import { getMembershipWorkLimit, getMembershipWorkLimits } from './work-limits.mts'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  renewalPriceIncreaseUser,
  type RenewalPriceIncreaseUser,
} from './renewal-price-increase-user.mts'

export async function getUsersApproachingRenewalWithPriceIncrease(
  afterId?: string,
  batchSize = getMembershipWorkLimits().batchSize,
): Promise<RenewalPriceIncreaseUser[]> {
  const { rows } = await read(sql`/* getUsersApproachingRenewalWithPriceIncrease */
    SELECT m.user_id, m.id AS membership_id,
      observation.id AS membership_provider_observation_id,
      observation.observed_price_minor_units AS current_price_minor_units,
      observation.renewal_price_minor_units AS new_price_minor_units,
      observation.observed_price_currency_code AS currency_code,
      product.plan, product.billing_interval AS interval,
      observation.renewal_effective_at AS expires_at
    FROM memberships m
    LEFT JOIN membership_renewal_price_increase_notification_work_items work ON work.membership_id = m.id
    INNER JOIN membership_source_states state
      ON state.membership_source_id = m.membership_source_id
      AND state.membership_product_id = m.membership_product_id
      AND state.source_kind = 'direct'
    INNER JOIN membership_provider_observations observation
      ON observation.id = state.membership_provider_observation_id
      AND observation.membership_provider_lineage_id = state.membership_provider_lineage_id
      AND observation.membership_product_id = state.membership_product_id
      AND observation.source_kind = 'direct' AND observation.should_auto_renew = true
    INNER JOIN membership_provider_evidence_records evidence
      ON evidence.id = observation.membership_provider_evidence_record_id
      AND evidence.verified_at IS NOT NULL AND evidence.rejected_at IS NULL
    INNER JOIN membership_products product ON product.id = m.membership_product_id
    INNER JOIN membership_products renewal_product
      ON renewal_product.id = observation.renewal_membership_product_id
      AND renewal_product.plan = product.plan
      AND renewal_product.billing_interval = product.billing_interval
    WHERE (${afterId ?? null}::uuid IS NULL OR m.id > ${afterId ?? null}::uuid)
      AND m.projection_ended_at IS NULL
      AND state.should_auto_renew = true AND state.cancelled_at IS NULL
      AND state.past_due_at IS NULL AND state.expires_at > CURRENT_TIMESTAMP
      AND observation.cancelled_at IS NULL AND observation.past_due_at IS NULL
      AND observation.expires_at > CURRENT_TIMESTAMP
      AND m.cancelled_at IS NULL
      AND m.expired_at IS NULL
      AND m.past_due_at IS NULL
      AND m.paused_at IS NULL
      AND m.should_cancel_at_period_end = false
      AND m.expires_at > CURRENT_TIMESTAMP
      AND observation.renewal_effective_at > CURRENT_TIMESTAMP
      AND observation.renewal_effective_at <= CURRENT_TIMESTAMP + INTERVAL '30 days'
      AND observation.renewal_price_currency_code = observation.observed_price_currency_code
      AND observation.renewal_price_minor_units > observation.observed_price_minor_units
      AND (
        ((work.leased_at IS NULL
          OR work.lease_expires_at <= clock_timestamp()) AND
          (work.membership_provider_product_id,
          work.price_minor_units,
          work.currency_code,
          work.effective_at)
        IS DISTINCT FROM
        (observation.renewal_membership_provider_product_id,
          observation.renewal_price_minor_units,
          observation.renewal_price_currency_code,
          observation.renewal_effective_at))
        OR (work.completed_at IS NULL
          AND work.delivery_attempted_at IS NULL
          AND (work.leased_at IS NULL
            OR work.lease_expires_at <= clock_timestamp()))
      )
    ORDER BY m.id LIMIT ${batchSize}
  `)
  return rows.map(renewalPriceIncreaseUser)
}

export type RenewalPriceIncreaseNotificationClaim = { leaseToken: string; generation: string }
export { prepareRenewalPriceIncreaseNotification } from './renewal-notification-prepare.mts'

export async function claimRenewalPriceIncreaseNotification(
  membershipId: string,
  userId: string,
  membershipProviderObservationId: string,
  generation: string,
): Promise<RenewalPriceIncreaseNotificationClaim | null> {
  const leaseHours = getMembershipWorkLimit('renewal_claim_hours')
  const { rows } =
    await write<RenewalPriceIncreaseNotificationClaim>(sql`/* claimRenewalPriceIncreaseNotification */
    WITH candidate AS (
      SELECT m.id
    FROM memberships m
    INNER JOIN membership_renewal_price_increase_notification_work_items work ON work.membership_id = m.id
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
        AND work.generation = ${generation}::bigint
        AND work.membership_provider_observation_id = observation.id
        AND work.membership_provider_product_id = observation.renewal_membership_provider_product_id
        AND work.price_minor_units = observation.renewal_price_minor_units
        AND work.currency_code = observation.renewal_price_currency_code
        AND work.effective_at = observation.renewal_effective_at
        AND work.completed_at IS NULL AND work.delivery_attempted_at IS NULL
        AND work.available_at <= clock_timestamp()
        AND (work.lease_token IS NULL OR work.lease_expires_at <= clock_timestamp())
      FOR UPDATE OF m
    )
    UPDATE membership_renewal_price_increase_notification_work_items work
    SET lease_token = uuidv7(), leased_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + ${leaseHours}::integer * INTERVAL '1 hour',
      attempt_count = attempt_count + 1
    FROM candidate WHERE work.membership_id = candidate.id AND work.generation = ${generation}::bigint
      AND work.completed_at IS NULL AND work.delivery_attempted_at IS NULL
      AND (work.lease_token IS NULL OR work.lease_expires_at <= clock_timestamp())
    RETURNING work.lease_token AS "leaseToken", work.generation::text AS generation
  `)
  return rows[0] ?? null
}
