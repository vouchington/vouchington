import { markJwtStaleBatch } from '@data-stores/valkey/jwt-stale'
import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import { enqueueBulkRecalculateUserVoteWeight } from '@queues/vote-weight/enqueues'
import sql from 'sql-template-strings'

const DEFAULT_ENTITLEMENT_EFFECT_BATCH_SIZE = 100
const DELIVERY_CLAIM_TTL_SECONDS = 300

export type MembershipEntitlementEffect = {
  id: string
  userId: string
  deliveryClaimToken: string
}

export async function recordMembershipEntitlementEffect(
  membershipChangeId: string,
  userId: string,
  query?: QueryExecutor,
): Promise<void> {
  if (!query) {
    await using query = await beginTransaction()
    await recordMembershipEntitlementEffect(membershipChangeId, userId, query)
    await query.commit()
    return
  }
  await query(sql`/* recordMembershipEntitlementEffect */
    INSERT INTO membership_entitlement_effects (membership_change_id, user_id)
    VALUES (${membershipChangeId}, ${userId})
    ON CONFLICT (membership_change_id) DO NOTHING`)
}

export async function claimPendingMembershipEntitlementEffects(
  batchSize = DEFAULT_ENTITLEMENT_EFFECT_BATCH_SIZE,
): Promise<MembershipEntitlementEffect[]> {
  const deliveryClaimToken = crypto.randomUUID()
  await using query = await beginTransaction()
  const { rows } = await query(sql`/* claimPendingMembershipEntitlementEffects */
      WITH candidates AS (
        SELECT id
        FROM membership_entitlement_effects
        WHERE delivered_at IS NULL
          AND (
            delivery_claimed_at IS NULL
            OR delivery_claimed_at < CURRENT_TIMESTAMP - make_interval(secs => ${DELIVERY_CLAIM_TTL_SECONDS})
          )
        ORDER BY id
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE membership_entitlement_effects effect
      SET delivery_claim_token = ${deliveryClaimToken},
          delivery_claimed_at = CURRENT_TIMESTAMP
      FROM candidates
      WHERE effect.id = candidates.id
      RETURNING effect.id, effect.user_id, effect.delivery_claim_token`)
  const result = (
    rows as Array<{
      id: string
      user_id: string
      delivery_claim_token: string
    }>
  ).map(row => ({
    id: row.id,
    userId: row.user_id,
    deliveryClaimToken: row.delivery_claim_token,
  }))
  await query.commit()
  return result
}

export async function completeMembershipEntitlementEffects(
  effects: readonly MembershipEntitlementEffect[],
): Promise<number> {
  if (effects.length === 0) return 0
  const effectsByToken = Map.groupBy(effects, effect => effect.deliveryClaimToken)
  const completions = await Promise.all(
    [...effectsByToken].map(async ([deliveryClaimToken, claimedEffects]) => {
      await using query = await beginTransaction()
      const { rows } = await query(sql`/* completeMembershipEntitlementEffects */
        UPDATE membership_entitlement_effects
        SET delivered_at = CURRENT_TIMESTAMP,
            delivery_claim_token = NULL,
            delivery_claimed_at = NULL
        WHERE id = ANY(${claimedEffects.map(effect => effect.id)}::uuid[])
          AND delivered_at IS NULL
          AND delivery_claim_token = ${deliveryClaimToken}
        RETURNING id`)
      await query.commit()
      return rows.length
    }),
  )
  return completions.reduce((total, completion) => total + completion, 0)
}

/**
 * Delivers claimed durable effects. Completion is intentionally last: an interruption after either
 * idempotent downstream operation leaves the effect reclaimable until both effects have converged.
 */
export async function deliverPendingMembershipEntitlementEffects(
  batchSize = DEFAULT_ENTITLEMENT_EFFECT_BATCH_SIZE,
): Promise<number> {
  const effects = await claimPendingMembershipEntitlementEffects(batchSize)
  if (effects.length === 0) return 0

  const userIds = [...new Set(effects.map(effect => effect.userId))]
  await markJwtStaleBatch(userIds)
  await enqueueBulkRecalculateUserVoteWeight(userIds, true)
  return await completeMembershipEntitlementEffects(effects)
}
