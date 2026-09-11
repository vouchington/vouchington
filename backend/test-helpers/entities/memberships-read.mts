import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { MembershipPlanSlug } from '@voucha/types/entities/membership'

export type TestMembershipRaw = {
  id: string
  plan: MembershipPlanSlug
  sku_id: string
  stripe_subscription_id: string | null
  stripe_customer_id: string | null
  granted_by_id: string | null
  issuer_snapshot: string | null
  calendar_days: number | null
  cancelled_at: Date | null
  expired_at: Date | null
  past_due_at: Date | null
  paused_at: Date | null
  cancel_at_period_end: boolean
  source_auto_renews: boolean | null
  source_effective_at: Date | null
  expires_at: Date | null
  source_expires_at: Date | null
  source_cancelled_at: Date | null
  source_expired_at: Date | null
  source_past_due_at: Date | null
  source_paused_at: Date | null
  projection_ended_at: Date | null
  latest_change_id: string | null
  status: string
}

export async function getTestMembershipRaw(
  membershipId: string,
): Promise<TestMembershipRaw | undefined> {
  const { rows } = await read(sql`/* getTestMembershipRaw */
    SELECT
      membership.*,
      product.plan,
      membership.membership_product_id AS sku_id,
      source_state.auto_renews AS source_auto_renews,
      source_state.effective_at AS source_effective_at,
      lineage.provider_lineage_id AS stripe_subscription_id,
      lineage.provider_account_id AS stripe_customer_id,
      grant_row.granted_by_id,
      grant_row.issuer_snapshot,
      grant_row.calendar_days,
      source_state.expires_at AS source_expires_at,
      source_state.cancelled_at AS source_cancelled_at,
      source_state.expired_at AS source_expired_at,
      source_state.past_due_at AS source_past_due_at,
      source_state.paused_at AS source_paused_at,
      CASE
        WHEN membership.cancelled_at IS NOT NULL THEN 'cancelled'
        WHEN membership.expired_at IS NOT NULL THEN 'expired'
        WHEN membership.paused_at IS NOT NULL THEN 'paused'
        WHEN membership.past_due_at IS NOT NULL THEN 'past_due'
        ELSE 'active'
      END AS status
    FROM memberships membership
    INNER JOIN membership_products product ON product.id = membership.membership_product_id
    LEFT JOIN membership_sources source ON source.id = membership.membership_source_id
    LEFT JOIN membership_source_states source_state
      ON source_state.membership_source_id = membership.membership_source_id
    LEFT JOIN membership_provider_lineages lineage ON lineage.id = source.membership_provider_lineage_id
    LEFT JOIN membership_grants grant_row ON grant_row.membership_source_id = source.id
    WHERE membership.id = ${membershipId}
  `)
  return rows[0] as TestMembershipRaw | undefined
}

export type TestMembershipGrant = {
  activation_ended_at: Date | null
  activation_started_at: Date | null
  id: string
  revoked_at: Date | null
  revoked_by_id: string | null
  revocation_reason: string | null
  source_cancelled_at: Date | null
  source_effective_at: Date
  source_expired_at: Date | null
}

export async function getTestMembershipGrant(
  grantId: string,
): Promise<TestMembershipGrant | undefined> {
  const { rows } = await read<TestMembershipGrant>(sql`/* getTestMembershipGrant */
    SELECT grant_row.id, grant_row.revoked_at, grant_row.revoked_by_id,
      grant_row.revocation_reason, source_state.cancelled_at AS source_cancelled_at,
      source_state.effective_at AS source_effective_at,
      source_state.expired_at AS source_expired_at,
      activation.started_at AS activation_started_at, activation.ended_at AS activation_ended_at
    FROM membership_grants grant_row
    INNER JOIN membership_source_states source_state
      ON source_state.membership_source_id = grant_row.membership_source_id
    LEFT JOIN membership_grant_activation_periods activation
      ON activation.membership_grant_id = grant_row.id
    WHERE grant_row.id = ${grantId}
    ORDER BY activation.id DESC
    LIMIT 1`)
  return rows[0]
}

export async function getTestMembershipGrantActivations(
  grantId: string,
): Promise<Array<{ ended_at: Date | null; started_at: Date }>> {
  const { rows } = await read<{ ended_at: Date | null; started_at: Date }>(
    sql`/* getTestMembershipGrantActivations */
      SELECT started_at, ended_at
      FROM membership_grant_activation_periods
      WHERE membership_grant_id = ${grantId}
      ORDER BY id`,
  )
  return rows
}

export async function getTestMembershipSourceState(membershipId: string): Promise<
  | {
      cancelled_at: Date | null
      auto_renews: boolean
      effective_at: Date
      expired_at: Date | null
      membership_provider_observation_id: string | null
      past_due_at: Date | null
      paused_at: Date | null
    }
  | undefined
> {
  const { rows } = await read<{
    cancelled_at: Date | null
    auto_renews: boolean
    effective_at: Date
    expired_at: Date | null
    membership_provider_observation_id: string | null
    past_due_at: Date | null
    paused_at: Date | null
  }>(
    sql`/* getTestMembershipSourceState */
      SELECT source_state.auto_renews, source_state.cancelled_at, source_state.effective_at, source_state.expired_at,
        source_state.membership_provider_observation_id, source_state.past_due_at, source_state.paused_at
      FROM memberships membership
      INNER JOIN membership_source_states source_state
        ON source_state.membership_source_id = membership.membership_source_id
      WHERE membership.id = ${membershipId}`,
  )
  return rows[0]
}

export async function getTestGrantQueue(userId: string) {
  const { rows } = await read<{
    active_grant_ids: string[]
    grant_ids: string[]
    grant_notes: Array<string | null>
    open_activation_count: number
  }>(sql`/* getTestGrantQueue */
    SELECT ARRAY_AGG(grant_row.id ORDER BY grant_row.id) AS grant_ids,
      ARRAY_AGG(grant_row.note ORDER BY grant_row.id) AS grant_notes,
      COALESCE(
        ARRAY_AGG(grant_row.id ORDER BY grant_row.id)
          FILTER (WHERE EXISTS (
            SELECT 1
            FROM membership_grant_activation_periods active_activation
            WHERE active_activation.membership_grant_id = grant_row.id
              AND active_activation.ended_at IS NULL
          )),
        ARRAY[]::uuid[]
      ) AS active_grant_ids,
      (
        SELECT COUNT(*)::int
        FROM membership_grant_activation_periods activation
        INNER JOIN membership_grants activated_grant ON activated_grant.id = activation.membership_grant_id
        WHERE activated_grant.user_id = ${userId}
          AND activation.ended_at IS NULL
      ) AS open_activation_count
    FROM membership_grants grant_row
    WHERE grant_row.user_id = ${userId}`)
  return rows[0]
}

export async function getTestMembershipGrantRemainingMilliseconds(
  grantId: string,
): Promise<number | undefined> {
  const { rows } = await read<{ remaining_milliseconds: string }>(
    sql`/* getTestMembershipGrantRemainingMilliseconds */
      SELECT FLOOR(EXTRACT(EPOCH FROM membership_grant_remaining_duration(${grantId})) * 1000)
        ::bigint AS remaining_milliseconds`,
  )
  const remaining = rows[0]?.remaining_milliseconds
  return remaining === undefined ? undefined : Number(remaining)
}
