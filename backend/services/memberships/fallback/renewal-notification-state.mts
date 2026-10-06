import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type RenewalPriceIncreaseNotificationState = {
  generation: string
  membership_provider_observation_id: string
  membership_provider_product_id: string
  price_minor_units: string
  currency_code: string
  effective_at: Date
  completed_at: Date | null
  lease_token: string | null
  leased_at: Date | null
  lease_expires_at: Date | null
  delivery_attempted_at: Date | null
  attempt_count: number
  available_at: Date
}

export async function moveRenewalPriceIncreaseNotificationState(
  membershipSourceId: string,
  query: QueryExecutor,
): Promise<RenewalPriceIncreaseNotificationState | undefined> {
  const { rows } =
    await query<RenewalPriceIncreaseNotificationState>(sql`/* moveRenewalPriceIncreaseNotificationState */
    WITH previous AS MATERIALIZED (
      SELECT membership.id FROM memberships membership
      WHERE membership.membership_source_id = ${membershipSourceId}
        AND membership.projection_ended_at IS NOT NULL
      ORDER BY membership.projection_ended_at DESC, membership.id DESC LIMIT 1
      FOR UPDATE
    )
    DELETE FROM membership_renewal_price_increase_notification_work_items work
    USING previous WHERE work.membership_id = previous.id
    RETURNING work.generation::text, work.membership_provider_observation_id,
      work.membership_provider_product_id, work.price_minor_units::text, work.currency_code,
      work.effective_at, work.completed_at, work.lease_token, work.leased_at,
      work.lease_expires_at, work.delivery_attempted_at, work.attempt_count, work.available_at
  `)
  return rows[0]
}

export async function restoreRenewalPriceIncreaseNotificationState(
  membershipId: string,
  state: RenewalPriceIncreaseNotificationState,
  query: QueryExecutor,
): Promise<void> {
  await query(sql`/* restoreRenewalPriceIncreaseNotificationState */
    INSERT INTO membership_renewal_price_increase_notification_work_items (
      membership_id, generation, membership_provider_observation_id, membership_provider_product_id,
      price_minor_units, currency_code, effective_at, completed_at, lease_token,
      leased_at, lease_expires_at, delivery_attempted_at, attempt_count, available_at
    ) VALUES (${membershipId}, ${state.generation}, ${state.membership_provider_observation_id},
      ${state.membership_provider_product_id}, ${state.price_minor_units}, ${state.currency_code},
      ${state.effective_at}, ${state.completed_at}, ${state.lease_token}, ${state.leased_at},
      ${state.lease_expires_at}, ${state.delivery_attempted_at}, ${state.attempt_count}, ${state.available_at})
  `)
}
