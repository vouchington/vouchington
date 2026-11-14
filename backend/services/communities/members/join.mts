import { writeCommunityMembershipMutation } from '@services/communities/members/write-membership'
import { beginTransaction, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { enqueueDetectBanEvasionOnJoin } from '@queues/moderation-signals/enqueues'
import onError from '@modules/on-error'
import { createCodedError } from '@vouchington/sentry'
import { COMMUNITY_BANNED } from '@modules/on-error/error-codes'
import { deletePendingInvitesForMember } from '../invites/delete-pending-for-member.mts'
import type { Community, CommunityMember } from '../types.mts'
import { invalidateCommunityMemberUserMetrics } from './invalidate-user-metrics.mts'
import { assertCommunityMembershipCapacity } from '../membership-limits.mts'

export async function joinCommunity(
  currentUserId: string,
  community: Community,
): Promise<CommunityMember> {
  const communityId = community.id
  assert(!community.archived_at, 403, 'Community is archived')
  assert(
    community.visibility === 'public',
    403,
    'This community requires an invitation or application to join',
  )

  await using query = await beginTransaction()
  const options = { query }

  const member = await insertJoinedCommunityMember(communityId, currentUserId, options)

  await query.commit()

  // Fire-and-forget: detect ban evasion after join (skips early if user has no posts)
  await invalidateCommunityMemberUserMetrics(currentUserId)
  void enqueueDetectBanEvasionOnJoin(communityId, currentUserId).catch(onError)

  return member
}

async function insertJoinedCommunityMember(
  communityId: string,
  currentUserId: string,
  options: QueryOptions,
): Promise<CommunityMember> {
  const { rows: checkRows } = await write(
    sql`/* joinCommunity:check-eligibility */
    SELECT
      EXISTS (
        SELECT 1
        FROM community_members
        WHERE community_id = ${communityId}
          AND user_id = ${currentUserId}
          AND removed_at IS NULL
      ) AS existing,
      EXISTS (
        SELECT 1
        FROM community_bans
        WHERE community_id = ${communityId}
          AND user_id = ${currentUserId}
          AND lifted_at IS NULL
          AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      ) AS banned,
      EXISTS (
        SELECT 1
        FROM community_restrictions
        WHERE community_id = ${communityId}
          AND restriction_type = 'approved_members_only'
          AND lifted_at IS NULL
          AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      ) AS approved_members_only
    `,
    options,
  )
  const checks = checkRows[0] as {
    existing: boolean
    banned: boolean
    approved_members_only: boolean
  }
  assert(!checks.existing, 409, 'You are already a member of this community')
  if (checks.banned) {
    throw createCodedError(403, 'You are banned from this community', COMMUNITY_BANNED)
  }
  assert(
    !checks.approved_members_only,
    403,
    'This community is temporarily limited to approved members',
  )

  // ast-grep-ignore: no-three-sequential-awaits -- The capacity count must reject an exceeded quota before the member insert; pending invitations are consumed only after that insert.
  await assertCommunityMembershipCapacity(currentUserId, communityId, options)
  const { rows } = await writeCommunityMembershipMutation(
    sql`/* joinCommunity */
    INSERT INTO community_members (community_id, user_id, role)
    VALUES (${communityId}, ${currentUserId}, 'member')
    RETURNING id, community_id, user_id, role, approved_by_id, created_at, updated_at,
      removed_at, removed_by_id
    `,
    { userIds: [currentUserId], communityIds: [communityId] },
    options,
  )

  await deletePendingInvitesForMember(communityId, currentUserId, options)
  return rows[0] as CommunityMember
}
