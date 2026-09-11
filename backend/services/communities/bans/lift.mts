import { beginTransaction, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { isAdminUser } from '@services/users/authorization'
import { getCommunityMember } from '../members/get.mts'
import { getActiveCommunityBans } from './get.mts'
import { lockCommunityUsers } from './lock.mts'
import type { PrivateUser } from '@services/users/types'
import type { CommunityBan } from '../types.mts'
import { recordModeratorAction } from '@services/moderator-actions'

export async function liftCommunityBan(
  currentUser: PrivateUser,
  communityId: string,
  targetUserId: string,
): Promise<void> {
  const isAdmin = isAdminUser(currentUser)

  await using query = await beginTransaction()
  const options = { query }
  // Serialize against concurrent role changes for both the actor and target before reading
  // membership authority.
  await lockCommunityUsers(communityId, [currentUser.id, targetUserId], options)

  const bans = await getActiveCommunityBans(communityId, targetUserId, options)
  assert(bans.length > 0, 404, 'No active ban found for this user')

  // Authorize inside the transaction so a demotion/removal of the actor that commits before this
  // point is respected.
  if (!isAdmin) {
    const currentMembership = await getCommunityMember(communityId, currentUser.id, options)
    assert(
      currentMembership?.role === 'owner' || currentMembership?.role === 'moderator',
      403,
      'Forbidden',
    )
    await assertModeratorMayLiftAll(currentUser, communityId, bans, options)
  }

  // Lift all currently-active ban rows for this user. The WHERE clause mirrors the active-ban
  // predicate so naturally-expired rows (lifted_at IS NULL but expires_at in the past) are left
  // untouched and are not mislabeled as manually lifted.
  await write(
    sql`/* liftCommunityBan */
    UPDATE community_bans
    SET lifted_at = CURRENT_TIMESTAMP, lifted_by_id = ${currentUser.id}
    WHERE community_id = ${communityId}
      AND user_id = ${targetUserId}
      AND lifted_at IS NULL
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `,
    options,
  )

  await query.commit()

  await recordModeratorAction(currentUser.id, {
    actionType: 'lift_ban',
    communityId,
    targetUserId,
  })
}

// A moderator may not undo a ban issued by an owner or a site admin — otherwise any moderator
// could immediately reverse a privileged moderation decision. Owners and site admins (handled by
// the caller) can lift any ban. Best-effort: issuer privilege is derived from their current role.
// Checks all active bans; if any was issued by a privileged user the moderator is blocked.
async function assertModeratorMayLiftAll(
  currentUser: PrivateUser,
  communityId: string,
  bans: CommunityBan[],
  options: QueryOptions,
): Promise<void> {
  const actorMembership = await getCommunityMember(communityId, currentUser.id, options)
  if (actorMembership?.role !== 'moderator') return

  // Deduplicate banner IDs that need a privilege check.
  const bannerIdSet = new Set<string>()
  for (const ban of bans) {
    if (ban.banned_by_id && ban.banned_by_id !== currentUser.id) {
      bannerIdSet.add(ban.banned_by_id)
    }
  }
  const bannerIds = [...bannerIdSet]
  if (bannerIds.length === 0) return

  const { rows } = await write<{ privileged: boolean }>(
    sql`/* assertModeratorMayLiftAll */
      SELECT EXISTS (
        SELECT 1
        FROM unnest(${bannerIds}::uuid[]) AS banner_ids(user_id)
        WHERE EXISTS (
          SELECT 1 FROM community_members
          WHERE community_id = ${communityId}
            AND user_id = banner_ids.user_id
            AND role = 'owner'
            AND removed_at IS NULL
        ) OR EXISTS (
          SELECT 1
          FROM user_roles
          JOIN user_roles_types ON user_roles_types.id = user_roles.role_type_id
          JOIN users ON users.id = user_roles.user_id
          WHERE user_roles.user_id = banner_ids.user_id
            AND user_roles_types.slug = 'administrator'
            AND users.deleted_at IS NULL
        )
      ) AS privileged
    `,
    options,
  )
  assert(!rows[0]?.privileged, 403, 'Only an owner or admin can lift this ban')
}
