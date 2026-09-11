import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import { enqueueDeliverMembershipEntitlementEffectsBestEffort } from '@queues/memberships/enqueues'
import sql from 'sql-template-strings'
import { recordMembershipChange } from '../changes.mts'
import { restoreFallbackAfterCurrentAccessEndsInTransaction } from '../fallback/restore-after-current-access-ends.mts'
import { activateOldestQueuedGrant } from './activate-queued.mts'
import { expireElapsedMemberships } from './expire-elapsed.mts'
import { closeActiveGrant } from './revoke-state.mts'

export class CompletedMembershipGrantError extends Error {
  constructor() {
    super('Completed membership grants cannot be revoked')
    this.name = 'CompletedMembershipGrantError'
  }
}

export type RevokedMembershipGrant = {
  activatedNextGrant: boolean
  alreadyRevoked: boolean
  grantId: string
  revokedAt: Date
  userId: string
}

export async function revokeMembershipGrant(
  currentUserId: string,
  grantId: string,
  reason: string,
  dependencies: {
    enqueueDeliverMembershipEntitlementEffects?: typeof enqueueDeliverMembershipEntitlementEffectsBestEffort
  } = {},
): Promise<RevokedMembershipGrant | null> {
  const enqueueEntitlementEffects =
    dependencies.enqueueDeliverMembershipEntitlementEffects ??
    enqueueDeliverMembershipEntitlementEffectsBestEffort
  const revocationReason = reason.trim()
  if (revocationReason.length < 1 || revocationReason.length > 1000)
    throw new RangeError('Revocation reason must be 1-1000 characters')
  await using query = await beginTransaction()
  const outcome = await revokeGrantInTransaction(currentUserId, grantId, revocationReason, query)
  await query.commit()
  if (outcome.kind === 'completed') {
    if (outcome.expired > 0) void enqueueEntitlementEffects()
    throw new CompletedMembershipGrantError()
  }
  if (outcome.expired > 0 || (outcome.result && !outcome.result.alreadyRevoked))
    void enqueueEntitlementEffects()
  return outcome.result
}

async function revokeGrantInTransaction(
  currentUserId: string,
  grantId: string,
  reason: string,
  query: QueryExecutor,
): Promise<
  | { expired: number; kind: 'completed' }
  | { expired: number; kind: 'result'; result: RevokedMembershipGrant | null }
> {
  const { rows: userRows } = await query(sql`/* revokeMembershipGrant: find user */
    SELECT user_id FROM membership_grants WHERE id = ${grantId}`)
  const userId = (userRows[0] as { user_id: string } | undefined)?.user_id
  if (!userId) return { expired: 0, kind: 'result', result: null }
  const expired = await expireElapsedMemberships(userId, query)
  const { rows } = await query(sql`/* revokeMembershipGrant: lock grant */
    SELECT grant_row.id, grant_row.user_id, grant_row.membership_source_id,
      grant_row.membership_product_id, grant_row.revoked_at,
      EXISTS (
        SELECT 1 FROM membership_grant_activation_periods activation
        WHERE activation.membership_grant_id = grant_row.id AND activation.ended_at IS NULL
      ) AS active,
      membership_grant_remaining_duration(grant_row.id) >= INTERVAL '1 millisecond' AS remaining
    FROM membership_grants grant_row WHERE grant_row.id = ${grantId} FOR UPDATE`)
  const grant = rows[0] as
    | {
        active: boolean
        id: string
        membership_product_id: string
        membership_source_id: string
        remaining: boolean
        revoked_at: Date | null
        user_id: string
      }
    | undefined
  if (!grant) return { expired, kind: 'result', result: null }
  if (grant.revoked_at) {
    return {
      expired,
      kind: 'result',
      result: {
        grantId: grant.id,
        userId: grant.user_id,
        revokedAt: grant.revoked_at,
        alreadyRevoked: true,
        activatedNextGrant: false,
      },
    }
  }
  // A completed revocation changes no entitlement; deliberately do not enqueue invalidation.
  if (!grant.active && !grant.remaining) return { kind: 'completed', expired }
  const { rows: revocations } = await query(sql`/* revokeMembershipGrant: revoke */
    UPDATE membership_grants
    SET revoked_at = clock_timestamp(), revoked_by_id = ${currentUserId}, revocation_reason = ${reason}
    WHERE id = ${grant.id} AND revoked_at IS NULL RETURNING revoked_at`)
  const revokedAt = (revocations[0] as { revoked_at: Date }).revoked_at
  if (!grant.active) {
    await closeActiveGrant(grant.id, grant.membership_source_id, revokedAt, query)
    return {
      expired,
      kind: 'result',
      result: {
        grantId: grant.id,
        userId: grant.user_id,
        revokedAt,
        alreadyRevoked: false,
        activatedNextGrant: false,
      },
    }
  }
  const { rows: memberships } = await query(sql`/* revokeMembershipGrant: close projection */
    UPDATE memberships SET cancelled_at = ${revokedAt}, expired_at = NULL, past_due_at = NULL,
      paused_at = NULL, cancel_at_period_end = false
    WHERE user_id = ${grant.user_id} AND membership_source_id = ${grant.membership_source_id}
      AND projection_ended_at IS NULL
    RETURNING id, membership_product_id`)
  const membership = memberships[0] as { id: string; membership_product_id: string } | undefined
  if (!membership) {
    const { rows: directMemberships } = await query(
      sql`/* revokeMembershipGrant: find superseding direct term */
        SELECT 1 FROM memberships membership
        INNER JOIN membership_sources source ON source.id = membership.membership_source_id
        WHERE membership.user_id = ${grant.user_id} AND membership.projection_ended_at IS NULL
          AND source.source_kind = 'direct'
          AND membership.cancelled_at IS NULL AND membership.expired_at IS NULL
          AND membership.paused_at IS NULL
        LIMIT 1`,
    )
    if (directMemberships.length === 0)
      throw new Error('Active membership grant has no live projection')
    await closeActiveGrant(grant.id, grant.membership_source_id, revokedAt, query)
    return {
      expired,
      kind: 'result',
      result: {
        grantId: grant.id,
        userId: grant.user_id,
        revokedAt,
        alreadyRevoked: false,
        activatedNextGrant: false,
      },
    }
  }
  // ast-grep-ignore: no-three-sequential-awaits -- closing, auditing/outboxing, and promotion are ordered writes in one transaction
  await closeActiveGrant(grant.id, grant.membership_source_id, revokedAt, query)
  await recordMembershipChange({
    membershipId: membership.id,
    userId: grant.user_id,
    membershipSourceId: grant.membership_source_id,
    membershipGrantId: grant.id,
    changeType: 'admin_revoke',
    fromSkuId: membership.membership_product_id,
    cancelledAt: revokedAt,
    changedById: currentUserId,
    note: reason,
    query,
  })
  const activatedNextGrant = await activateOldestQueuedGrant(
    grant.user_id,
    {
      id: membership.id,
      membership_product_id: membership.membership_product_id,
      membership_source_id: grant.membership_source_id,
      expires_at: revokedAt,
    },
    query,
    revokedAt,
  )
  if (!activatedNextGrant)
    await restoreFallbackAfterCurrentAccessEndsInTransaction(grant.user_id, membership.id, query)
  return {
    expired,
    kind: 'result',
    result: {
      grantId: grant.id,
      userId: grant.user_id,
      revokedAt,
      alreadyRevoked: false,
      activatedNextGrant,
    },
  }
}
