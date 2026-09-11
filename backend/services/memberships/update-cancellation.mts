import { beginTransaction, write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { MembershipPlanSlug } from './types.mts'
import type { MembershipLifecycleFields } from './update-result.mts'
import { recordMembershipChange } from './changes.mts'
import { enqueueDeliverMembershipEntitlementEffectsBestEffort } from '@queues/memberships/enqueues'

async function setCancelAtPeriodEnd(
  membershipId: string,
  query: QueryExecutor = write,
): Promise<(MembershipLifecycleFields & { plan: MembershipPlanSlug }) | null> {
  const { rows } = await query(sql`/* setCancelAtPeriodEnd */
    WITH updated_membership AS (
      UPDATE memberships
      SET cancel_at_period_end = true
      WHERE id = ${membershipId}
        AND projection_ended_at IS NULL
        AND cancelled_at IS NULL
        AND expired_at IS NULL
        AND cancel_at_period_end = false
      RETURNING *
    ), updated_source AS (
      UPDATE membership_source_states state
      SET auto_renews = false,
          updated_at = CURRENT_TIMESTAMP
      FROM updated_membership membership
      WHERE state.membership_source_id = membership.membership_source_id
      RETURNING state.membership_source_id
    )
    SELECT
      membership.user_id,
      (SELECT plan FROM membership_products WHERE id = membership.membership_product_id) AS plan,
      membership.membership_product_id AS sku_id,
      CASE
        WHEN membership.cancelled_at IS NOT NULL THEN 'cancelled'
        WHEN membership.expired_at IS NOT NULL THEN 'expired'
        WHEN membership.paused_at IS NOT NULL THEN 'paused'
        WHEN membership.past_due_at IS NOT NULL THEN 'past_due'
        ELSE 'active'
      END AS status,
      membership.expires_at,
      membership.cancelled_at,
      membership.expired_at,
      membership.past_due_at,
      membership.paused_at,
      membership.cancel_at_period_end
    FROM updated_membership membership
    LEFT JOIN updated_source source
      ON source.membership_source_id = membership.membership_source_id
  `)

  if (rows.length === 0) return null
  return rows[0] as MembershipLifecycleFields & { plan: MembershipPlanSlug }
}

export async function cancelMembership(currentUserId: string, membershipId: string): Promise<void> {
  await using transaction = await beginTransaction()
  const membership = await setCancelAtPeriodEnd(membershipId, transaction)
  if (membership) {
    await recordMembershipChange({
      membershipId,
      userId: membership.user_id,
      changeType: 'cancellation',
      fromSkuId: membership.sku_id,
      toSkuId: membership.sku_id,
      cancelledAt: membership.cancelled_at,
      expiredAt: membership.expired_at,
      pastDueAt: membership.past_due_at,
      pausedAt: membership.paused_at,
      cancelAtPeriodEnd: true,
      changedById: currentUserId,
      query: transaction,
    })
  }
  await transaction.commit()
  if (!membership) return
  void enqueueDeliverMembershipEntitlementEffectsBestEffort()
}
