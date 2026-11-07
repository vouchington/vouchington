import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { expireExhaustedPausedGrants } from './expire-exhausted-paused-grants.mts'
import { restoreFallbackAfterCurrentAccessEndsInTransaction } from '../fallback/restore-after-current-access-ends.mts'
import { activateOldestQueuedGrant } from './activate-queued.mts'
import { getCurrentMembershipProjection } from './current-projection.mts'
import { expireElapsedMemberships } from './expire-elapsed.mts'
import { resumePausedGrantProjection } from './resume-paused-grant.mts'
import { selectDirectTerminationReplacement } from './select-direct-termination-replacement.mts'
export async function resumeGrantAfterDirectAccessSuspensionInTransaction(
  userId: string,
  membershipId: string,
  query: QueryExecutor,
): Promise<{
  activeFamily: boolean
  activeGrant: boolean
  changed: boolean
  retainsPaidAccess: boolean
}> {
  await query(sql`/* resumeGrantAfterDirectTermination: lock user */
    SELECT id FROM users WHERE id = ${userId} FOR UPDATE`)
  const { rows } = await query(sql`/* resumeGrantAfterDirectTermination: source */
    SELECT membership.membership_source_id, membership.membership_product_id,
      COALESCE(source_state.cancelled_at, source_state.expired_at, source_state.paused_at)
        AS access_suspended_at
    FROM memberships membership
    INNER JOIN membership_sources source ON source.id = membership.membership_source_id
    INNER JOIN membership_source_states source_state
      ON source_state.membership_source_id = source.id
    WHERE membership.id = ${membershipId} AND membership.user_id = ${userId}
      AND source.source_kind = 'direct'
      AND (
        source_state.cancelled_at IS NOT NULL
        OR source_state.expired_at IS NOT NULL
        OR source_state.paused_at IS NOT NULL
      )
    FOR UPDATE`)
  const direct = rows[0] as
    | { membership_product_id: string; membership_source_id: string; access_suspended_at: Date }
    | undefined
  if (!direct)
    return { activeFamily: false, activeGrant: false, changed: false, retainsPaidAccess: false }
  const expiredCount = await expireExhaustedPausedGrants(userId, direct.access_suspended_at, query)
  const replacement = await selectDirectTerminationReplacement(
    userId,
    direct.membership_source_id,
    query,
  )
  const restoredRetainedSource =
    replacement && replacement.source_kind !== 'admin_grant'
      ? await restoreFallbackAfterCurrentAccessEndsInTransaction(userId, membershipId, query, {
          membershipSourceId: replacement.membership_source_id,
        })
      : false
  if (restoredRetainedSource) {
    const projection = await getCurrentMembershipProjection(userId, query)
    return {
      activeFamily: false,
      activeGrant: false,
      changed: true,
      retainsPaidAccess: projection?.active === true,
    }
  }
  const resumedActiveGrant =
    replacement?.source_kind === 'admin_grant'
      ? await resumePausedGrantProjection(
          userId,
          direct.access_suspended_at,
          replacement.membership_source_id,
          query,
        )
      : false
  const activated = resumedActiveGrant
    ? false
    : replacement?.source_kind === 'admin_grant' &&
      (await activateOldestQueuedGrant(
        userId,
        {
          id: membershipId,
          membership_source_id: direct.membership_source_id,
          membership_product_id: direct.membership_product_id,
          expires_at: direct.access_suspended_at,
        },
        query,
        direct.access_suspended_at,
        replacement.membership_source_id,
      ))
  if (activated) await expireElapsedMemberships(userId, query)
  const currentProjection = await getCurrentMembershipProjection(userId, query)
  const currentIsCoveringFallback =
    currentProjection?.active === true && currentProjection.source_kind !== 'direct'
  const restoredFallback =
    !currentIsCoveringFallback && currentProjection
      ? await restoreFallbackAfterCurrentAccessEndsInTransaction(
          userId,
          currentProjection.id,
          query,
        )
      : false
  const finalProjection = restoredFallback
    ? await getCurrentMembershipProjection(userId, query)
    : currentProjection
  return {
    activeGrant: finalProjection?.active === true && finalProjection.source_kind === 'admin_grant',
    activeFamily: finalProjection?.active === true && finalProjection.source_kind === 'family',
    changed: expiredCount > 0 || resumedActiveGrant || activated || restoredFallback,
    retainsPaidAccess: finalProjection?.active === true,
  }
}
