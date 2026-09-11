import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { parsePostgresMoneyAmount, type Money } from '@ts-shared/money'

export type RenewalPriceIncreaseDetails = {
  current_price: Money
  new_price: Money
  plan: string
  interval: string
  expires_at: Date
}

export async function getCurrentRenewalPriceIncreaseDetails(
  membershipId: string,
  userId: string,
  membershipProviderObservationId: string,
  claimToken: string,
): Promise<RenewalPriceIncreaseDetails | null> {
  const { rows } = await write(sql`/* getCurrentRenewalPriceIncreaseDetails */
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
    SELECT observation.observed_price_minor_units AS current_price_minor_units,
      observation.renewal_price_minor_units AS new_price_minor_units,
      observation.observed_price_currency_code AS currency_code,
      product.plan, product.billing_interval AS interval,
      observation.renewal_effective_at AS expires_at
    FROM target
    INNER JOIN memberships m ON m.id = target.id
    INNER JOIN membership_source_states state
      ON state.membership_source_id = m.membership_source_id
      AND state.membership_product_id = m.membership_product_id
      AND state.source_kind = 'direct'
    INNER JOIN membership_provider_observations observation
      ON observation.id = state.membership_provider_observation_id
      AND observation.membership_provider_lineage_id = state.membership_provider_lineage_id
      AND observation.membership_product_id = state.membership_product_id
      AND observation.source_kind = 'direct' AND observation.auto_renews = true
    INNER JOIN membership_products product ON product.id = m.membership_product_id
    WHERE m.user_id = ${userId}
      AND observation.id = ${membershipProviderObservationId}
      AND m.renewal_price_increase_notified_observation_id = observation.id
      AND m.renewal_price_increase_claim_token = ${claimToken}
      AND m.renewal_price_increase_notified_provider_product_id = observation.renewal_membership_provider_product_id
      AND m.renewal_price_increase_notified_minor_units = observation.renewal_price_minor_units
      AND m.renewal_price_increase_notified_currency_code = observation.renewal_price_currency_code
      AND m.renewal_price_increase_notified_effective_at = observation.renewal_effective_at
      AND observation.renewal_price_currency_code = observation.observed_price_currency_code
      AND observation.renewal_price_minor_units > observation.observed_price_minor_units
    LIMIT 1
  `)
  const row = rows[0] as
    | {
        current_price_minor_units: string
        new_price_minor_units: string
        currency_code: Money['currency']
        plan: string
        interval: string
        expires_at: Date
      }
    | undefined
  if (!row) return null
  return {
    current_price: {
      amount: parsePostgresMoneyAmount(row.current_price_minor_units),
      currency: row.currency_code,
    },
    new_price: {
      amount: parsePostgresMoneyAmount(row.new_price_minor_units),
      currency: row.currency_code,
    },
    plan: row.plan,
    interval: row.interval,
    expires_at: row.expires_at,
  }
}
