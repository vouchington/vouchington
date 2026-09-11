import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { isAdminUser } from '@services/users/authorization'
import { getPublicUserByAny } from '@services/users/get'
import { getCommunityMember } from '../members/get.mts'
import { lockCommunityUsers } from './lock.mts'
import { enqueueOnCommunityAgentPromptsDeactivated } from '@queues/entity-listeners/enqueues'
import onError from '@modules/on-error'
import type { PrivateUser } from '@services/users/types'
import type { CommunityBan, CommunityMemberRole } from '../types.mts'
import { recordModeratorAction } from '@services/moderator-actions'
import { openOrGetOpenCase, maybeResolveCase } from '@services/moderation-cases'
import { invalidateCommunityMemberUserMetrics } from '../members/invalidate-user-metrics.mts'

export async function banUserFromCommunity(
  currentUser: PrivateUser,
  communityId: string,
  targetUserId: string,
  opts?: { reason?: string; expiresAt?: Date; bypassCommunityMemberCheck?: boolean },
): Promise<CommunityBan> {
  assert(currentUser.id !== targetUserId, 422, 'You cannot ban yourself')
  assert(await getPublicUserByAny(targetUserId), 404, 'User not found')

  const caseId = await openOrGetOpenCase({ entityType: 'user', entityId: targetUserId })
  let targetRoleBeforeBan: CommunityMemberRole | null = null

  await using query = await beginTransaction()
  const options = { query }

  // Serialize against concurrent joins/posts/approvals, other bans, and role changes for the
  // actor or target before reading membership authority.
  await lockCommunityUsers(communityId, [currentUser.id, targetUserId], options)

  const isAdmin = isAdminUser(currentUser) || (opts?.bypassCommunityMemberCheck ?? false)
  const targetMembership = await getCommunityMember(communityId, targetUserId, options)
  targetRoleBeforeBan = targetMembership?.role ?? null

  // Owners can never be banned, by anyone (including site admins) — a banned owner would
  // leave the community with no active owner.
  assert(targetMembership?.role !== 'owner', 403, 'Community owners cannot be banned')

  // Whether the caller is a plain community moderator (not owner/admin). Such callers may only
  // act on regular members, so their kick is also scoped to role = 'member'.
  let callerIsModeratorOnly = false
  if (!isAdmin) {
    const currentMembership = await getCommunityMember(communityId, currentUser.id, options)
    assert(currentMembership, 403, 'Forbidden')
    assert(
      currentMembership.role === 'owner' || currentMembership.role === 'moderator',
      403,
      'Forbidden',
    )

    // Moderators can only ban users who are currently active regular members. Banning
    // non-members or privileged users is reserved for owners and site admins.
    if (currentMembership.role === 'moderator') {
      callerIsModeratorOnly = true
      assert(targetMembership?.role === 'member', 403, 'Moderators can only ban regular members')
    }
  }

  // Always insert a fresh row. Multiple concurrent active bans are allowed; a re-ban on an
  // already-banned user creates a second active row. Naturally expired bans (lifted_at IS NULL
  // but expires_at in the past) are left untouched so moderation history preserves their
  // original expiry.
  const { rows } = await write(
    sql`/* banUserFromCommunity:insert */
    INSERT INTO community_bans (community_id, user_id, banned_by_id, reason, expires_at, case_id)
    VALUES (${communityId}, ${targetUserId}, ${currentUser.id}, ${opts?.reason ?? null}, ${opts?.expiresAt ?? null}, ${caseId})
    RETURNING *
    `,
    options,
  )

  // Kick active membership in the same transaction. Owners can never be kicked here (a racing
  // ownership transfer must not leave the community ownerless); a moderator caller is further
  // scoped to role = 'member' so a target promoted to moderator mid-race is not kicked either.
  const kickRolePredicate = callerIsModeratorOnly
    ? sql`AND role = 'member'`
    : sql`AND role <> 'owner'`
  await write(
    sql`/* banUserFromCommunity:kick */
    UPDATE community_members
    SET removed_at = CURRENT_TIMESTAMP, removed_by_id = ${currentUser.id}
    WHERE community_id = ${communityId}
      AND user_id = ${targetUserId}
      AND removed_at IS NULL
    `
      .append(' ')
      .append(kickRolePredicate),
    options,
  )

  // If a concurrent role change promoted the target past what the caller may ban (to owner for
  // any caller, or to moderator for a moderator caller) after the membership read above, abort
  // the whole ban — the throw rolls back the inserted/updated ban row so no privileged member is
  // left carrying an active ban.
  const postKickMembership = await getCommunityMember(communityId, targetUserId, options)
  assert(postKickMembership?.role !== 'owner', 409, 'User became a community owner; ban aborted')
  assert(
    !(callerIsModeratorOnly && postKickMembership?.role === 'moderator'),
    409,
    'User became a community moderator; ban aborted',
  )

  const ban = rows[0] as CommunityBan

  await query.commit()

  // Free agent prompt slots for banned moderators/owners
  if (targetRoleBeforeBan === 'moderator' || targetRoleBeforeBan === 'owner') {
    void enqueueOnCommunityAgentPromptsDeactivated(currentUser.id, targetUserId, communityId)
  }

  await Promise.all([
    recordModeratorAction(currentUser.id, {
      actionType: 'ban',
      communityId,
      targetUserId,
      reason: opts?.reason ?? null,
    }),
    maybeResolveCase(caseId, currentUser.id),
    invalidateCommunityMemberUserMetrics(targetUserId),
  ])

  import('@services/notifications/create-community-ban-notification')
    .then(m => m.createCommunityBanNotification(targetUserId, ban.id))
    .catch(onError)

  return ban
}
