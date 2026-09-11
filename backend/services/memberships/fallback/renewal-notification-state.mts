import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type RenewalPriceIncreaseNotificationState = {
  renewal_price_increase_claim_token: string | null
  renewal_price_increase_claimed_at: Date | null
  renewal_price_increase_delivery_attempted_at: Date | null
  renewal_price_increase_notified_at: Date | null
  renewal_price_increase_notified_currency_code: string | null
  renewal_price_increase_notified_effective_at: Date | null
  renewal_price_increase_notified_minor_units: string | null
  renewal_price_increase_notified_observation_id: string | null
  renewal_price_increase_notified_provider_product_id: string | null
}

export async function moveRenewalPriceIncreaseNotificationState(
  membershipSourceId: string,
  query: QueryExecutor,
): Promise<RenewalPriceIncreaseNotificationState | undefined> {
  const { rows } = await query(sql`/* restoreFallbackAfterCurrentAccessEnds: renewal notification */
    WITH previous AS MATERIALIZED (
      SELECT membership.id,
        membership.renewal_price_increase_notified_observation_id,
        membership.renewal_price_increase_notified_provider_product_id,
        membership.renewal_price_increase_notified_minor_units,
        membership.renewal_price_increase_notified_currency_code,
        membership.renewal_price_increase_notified_effective_at,
        membership.renewal_price_increase_notified_at,
        membership.renewal_price_increase_claim_token,
        membership.renewal_price_increase_claimed_at,
        membership.renewal_price_increase_delivery_attempted_at
      FROM memberships membership
      WHERE membership.membership_source_id = ${membershipSourceId}
        AND membership.projection_ended_at IS NOT NULL
      ORDER BY membership.projection_ended_at DESC, membership.id DESC
      LIMIT 1
      FOR UPDATE
    ), cleared AS (
      UPDATE memberships membership
      SET renewal_price_increase_claim_token = NULL,
          renewal_price_increase_claimed_at = NULL
      FROM previous
      WHERE membership.id = previous.id
        AND previous.renewal_price_increase_claim_token IS NOT NULL
      RETURNING membership.id
    )
    SELECT previous.renewal_price_increase_notified_observation_id,
      previous.renewal_price_increase_notified_provider_product_id,
      previous.renewal_price_increase_notified_minor_units,
      previous.renewal_price_increase_notified_currency_code,
      previous.renewal_price_increase_notified_effective_at,
      previous.renewal_price_increase_notified_at,
      previous.renewal_price_increase_claim_token,
      previous.renewal_price_increase_claimed_at,
      previous.renewal_price_increase_delivery_attempted_at
    FROM previous
    LEFT JOIN cleared ON true`)
  return rows[0] as RenewalPriceIncreaseNotificationState | undefined
}
