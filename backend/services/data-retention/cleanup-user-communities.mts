import type { TransactionQuery } from '@data-stores/psql'
import {
  lockUserPurgeOwnership,
  transferCommunitiesOwnershipForUserPurge,
} from '@services/communities/ownership-transfer-user-purge'
import { invalidateCommunityMemberUserMetrics } from '@services/communities/members/invalidate-user-metrics'
import { invalidate } from '@services/entity-cache/invalidate'
import { runSequentially } from '@modules/utils/run-sequentially'
import sql from 'sql-template-strings'
import { archiveUserOwnedCommunities } from './archive-user-owned-communities.mts'
import { getCommunityPurgeBatchSize, getCommunityModeratorScanPageSize } from './config.mts'
import {
  NO_MODERATOR_CURSOR,
  selectUserPurgeSuccessors,
  type PurgeSuccessorScan,
} from './select-user-purge-successors.mts'
import type { UserPurgeAfterCommit, UserPurgeCursor } from './user-purge-types.mts'

type Community = { id: string; name: string; slug: string }
type CommunityPage = {
  processed: number
  userPurge?: UserPurgeCursor
  afterCommit: UserPurgeAfterCommit[]
}

/**
 * Current owner roles, rather than immutable creator provenance, determine succession. A page costs a
 * fixed number of statements: successors are fenced in user-id order before any community is locked.
 */
export async function cleanupUserOwnedCommunities(
  query: TransactionQuery,
  userId: string,
  limit: number,
  cursor?: UserPurgeCursor,
): Promise<CommunityPage> {
  const pageLimit = Math.min(limit, getCommunityPurgeBatchSize())
  const { rows: communities } =
    await query<Community>(sql`/* cleanupUserOwnedCommunities:candidates */
    SELECT community.id, community.name, community.slug
    FROM community_members owner JOIN communities community ON community.id = owner.community_id
    WHERE owner.user_id = ${userId} AND owner.role = 'owner' AND owner.removed_at IS NULL
      AND (${cursor?.communityId ?? null}::uuid IS NULL OR community.id = ${cursor?.communityId ?? null}::uuid)
    ORDER BY community.id LIMIT ${pageLimit}`)
  // A stale scope returns to global discovery before any owner memberships are removed.
  if (communities.length === 0) return { processed: 0, afterCommit: [] }
  const ids = communities.map(community => community.id)
  // Splitting the row budget keeps the page's total scan within `limit`; one community keeps it all.
  const pageSize = Math.max(
    1,
    Math.min(getCommunityModeratorScanPageSize(), Math.floor(limit / communities.length)),
  )
  const afterModeratorId = cursor?.afterModeratorId ?? NO_MODERATOR_CURSOR
  const scan = () => selectUserPurgeSuccessors(query, userId, ids, pageSize, afterModeratorId)
  let provisional = new Map<string, PurgeSuccessorScan>()
  let scans = new Map<string, PurgeSuccessorScan>()
  await runSequentially([
    async () => (provisional = await scan()),
    () =>
      lockUserPurgeOwnership(
        query,
        userId,
        ids,
        [...provisional.values()].flatMap(row =>
          row.userId ? [{ communityId: row.communityId, successorId: row.userId }] : [],
        ),
      ),
    // Authoritative: roles are fenced now, so a successor that changed since the first read is skipped.
    async () => (scans = await scan()),
  ])

  const resume = (community: Community, id: string): UserPurgeCursor => ({
    userId,
    communityId: community.id,
    afterModeratorId: id,
  })
  let processed = 0
  let continuation: UserPurgeCursor | undefined
  const transfers: { community: Community; successorId: string; memberId: string }[] = []
  const toArchive: string[] = []
  for (const community of communities) {
    const row = scans.get(community.id)!
    processed += Math.max(1, row.scanned)
    if (row.userId && row.memberId) {
      if (provisional.get(community.id)?.userId === row.userId)
        transfers.push({ community, successorId: row.userId, memberId: row.memberId })
      else continuation = resume(community, afterModeratorId)
    } else if (row.scanned === pageSize && row.lastId) continuation = resume(community, row.lastId)
    else toArchive.push(community.id)
    if (continuation || processed >= limit) break
  }

  const transfer = await transferCommunitiesOwnershipForUserPurge(query, userId, transfers)
  const failed = transfers.find(({ community }) => !transfer.transferred.includes(community.id))
  // An account or role changed under the fences: keep the rest of this page eligible.
  if (failed) continuation = resume(failed.community, failed.memberId)
  const archivedIds = await archiveUserOwnedCommunities(query, userId, toArchive)

  const result: CommunityPage = { processed, afterCommit: [] }
  if (transfer.afterCommit) result.afterCommit.push(transfer.afterCommit)
  const touchedIds = [...archivedIds, ...transfer.transferred]
  if (touchedIds.length > 0) {
    const successorIds = transfers.flatMap(({ community, successorId }) =>
      transfer.transferred.includes(community.id) ? [successorId] : [],
    )
    // The purge transaction bypasses the interactive wrappers' invalidation, so settle it once per page.
    result.afterCommit.push(async () => {
      await Promise.all([
        invalidate.communities(...touchedIds),
        invalidateCommunityMemberUserMetrics(...successorIds),
      ])
    })
  }
  return continuation ? { ...result, userPurge: continuation } : result
}
