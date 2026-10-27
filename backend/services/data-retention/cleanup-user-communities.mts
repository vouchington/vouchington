import type { TransactionQuery } from '@data-stores/psql'
import { archiveCommunity } from '@services/communities/archive'
import { transferCommunityOwnershipForUserPurge } from '@services/communities/ownership-transfer'
import { lockCommunityMembershipRoles } from '@services/communities/bans/lock'
import { invalidateCommunityMemberUserMetrics } from '@services/communities/members/invalidate-user-metrics'
import { invalidate } from '@services/entity-cache/invalidate'
import sql from 'sql-template-strings'
import { getCommunityPurgeBatchSize, getCommunityModeratorScanPageSize } from './config.mts'
import type { UserPurgeAfterCommit, UserPurgeCursor } from './user-purge-types.mts'

type Community = { id: string; name: string; slug: string }
type CommunityPage = {
  processed: number
  userPurge?: UserPurgeCursor
  afterCommit: UserPurgeAfterCommit[]
}

/** Current owner roles, rather than immutable creator provenance, determine succession. */
export async function cleanupUserOwnedCommunities(
  query: TransactionQuery,
  userId: string,
  limit: number,
  cursor?: UserPurgeCursor,
): Promise<CommunityPage> {
  const pageLimit = Math.min(limit, getCommunityPurgeBatchSize())
  const { rows: candidates } = await query<{
    id: string
  }>(sql`/* cleanupUserOwnedCommunities:candidates */
    SELECT community.id
    FROM community_members owner JOIN communities community ON community.id = owner.community_id
    WHERE owner.user_id = ${userId} AND owner.role = 'owner' AND owner.removed_at IS NULL
      AND (${cursor?.communityId ?? null}::uuid IS NULL OR community.id = ${cursor?.communityId ?? null}::uuid)
    ORDER BY community.id LIMIT ${pageLimit}`)
  await lockCommunityMembershipRoles(
    query,
    candidates.map(candidate => candidate.id),
  )
  const candidateIds = candidates.map(candidate => candidate.id)
  const { rows } =
    candidateIds.length === 0
      ? { rows: [] as Community[] }
      : await query<Community>(sql`/* cleanupUserOwnedCommunities:revalidated */
          SELECT community.id, community.name, community.slug
          FROM communities community
          WHERE community.id = ANY(${candidateIds}::uuid[])
            AND EXISTS (
              SELECT 1 FROM community_members owner
              WHERE owner.community_id = community.id AND owner.user_id = ${userId}
                AND owner.role = 'owner' AND owner.removed_at IS NULL
            )
          ORDER BY community.id`)
  const result: CommunityPage = {
    processed: candidates.length - rows.length,
    afterCommit: [],
  }
  const communitiesToArchive: Community[] = []
  const transferred: { communityId: string; successorId: string }[] = []
  let continuation: UserPurgeCursor | undefined
  for (const community of rows) {
    const remainingRows = limit - result.processed
    const afterModeratorId = cursor?.afterModeratorId
    // oxlint-disable no-await-in-loop -- the single call below determines one bounded community transition.
    // no-mistakes-disable-next-line query-reached-per-item: bounded page delegates to canonical per-community transfer/archive services.
    const settled = await settleOwnedCommunity(
      query,
      userId,
      community,
      remainingRows,
      afterModeratorId,
    )
    // oxlint-enable no-await-in-loop
    result.processed += Math.max(1, settled.scanned)
    if (settled.archive) communitiesToArchive.push(community)
    if (settled.userPurge) {
      continuation = settled.userPurge
      break
    }
    if (settled.afterCommit && settled.successorId) {
      result.afterCommit.push(settled.afterCommit)
      transferred.push({ communityId: community.id, successorId: settled.successorId })
    }
    if (result.processed >= limit) break
  }
  const archivedIds = await archiveOwnedCommunities(query, userId, communitiesToArchive)
  const touchedIds = [...archivedIds, ...transferred.map(transfer => transfer.communityId)]
  if (touchedIds.length > 0) {
    const successorIds = transferred.map(transfer => transfer.successorId)
    // The purge transaction bypasses the interactive wrappers' invalidation, so settle it once per page.
    result.afterCommit.push(async () => {
      await Promise.all([
        invalidate.communities(...touchedIds),
        invalidateCommunityMemberUserMetrics(...successorIds),
      ])
    })
  }
  if (continuation) return { ...result, userPurge: continuation }
  // A stale scope must return to global discovery before any owner memberships are removed.
  if (cursor && rows.length === 0) return { ...result, userPurge: undefined }
  return result
}

async function settleOwnedCommunity(
  query: TransactionQuery,
  userId: string,
  community: Community,
  remainingRows: number,
  afterModeratorId?: string,
): Promise<{
  scanned: number
  archive?: boolean
  userPurge?: UserPurgeCursor
  afterCommit?: UserPurgeAfterCommit
  successorId?: string
}> {
  const pageSize = Math.min(getCommunityModeratorScanPageSize(), remainingRows)
  const { rows } = await query<{
    scanned: number
    last_id: string | null
    member_id: string | null
    user_id: string | null
  }>(sql`/* cleanupUserOwnedCommunities:successor */
    WITH moderator_page AS MATERIALIZED (
      SELECT id, user_id FROM community_members
      WHERE community_id = ${community.id} AND role = 'moderator' AND removed_at IS NULL
        AND id > ${afterModeratorId ?? '00000000-0000-0000-0000-000000000000'}::uuid
        AND user_id <> ${userId}
      ORDER BY id LIMIT ${pageSize}
    )
    SELECT (SELECT count(*)::integer FROM moderator_page) AS scanned,
      (SELECT id FROM moderator_page ORDER BY id DESC LIMIT 1) AS last_id,
      successor.id AS member_id, successor.user_id
    FROM (SELECT 1) seed LEFT JOIN LATERAL (
      SELECT page.id, page.user_id FROM moderator_page page JOIN users candidate ON candidate.id = page.user_id
      WHERE candidate.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM user_suspensions WHERE user_id = candidate.id AND lifted_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM user_deletion_requests WHERE user_id = candidate.id AND completed_at IS NULL)
      ORDER BY page.id LIMIT 1
    ) successor ON true`)
  const page = rows[0]!
  const resume = (id: string): { scanned: number; userPurge: UserPurgeCursor } => ({
    scanned: page.scanned,
    userPurge: { userId, communityId: community.id, afterModeratorId: id },
  })
  if (page.user_id && page.member_id) {
    const afterCommit = await transferCommunityOwnershipForUserPurge(
      query,
      community,
      userId,
      page.user_id,
    )
    // An account or role changed under the lifecycle locks: keep the rest of this page eligible.
    return afterCommit
      ? { scanned: page.scanned, afterCommit, successorId: page.user_id }
      : resume(page.member_id)
  }
  if (page.scanned === pageSize && page.last_id) return resume(page.last_id)
  return { scanned: page.scanned, archive: true }
}

async function archiveOwnedCommunities(
  query: TransactionQuery,
  ownerUserId: string,
  communities: Community[],
): Promise<string[]> {
  if (communities.length === 0) return []
  const communityIds = communities.map(community => community.id).toSorted()
  const { rows } = await query<{ id: string }>(sql`/* cleanupUserOwnedCommunities:lockForArchive */
    SELECT community.id FROM communities community
    WHERE community.id = ANY(${communityIds}::uuid[])
      AND EXISTS (
        SELECT 1 FROM community_members owner
        WHERE owner.community_id = community.id AND owner.user_id = ${ownerUserId}
          AND owner.role = 'owner' AND owner.removed_at IS NULL
      )
    ORDER BY community.id FOR NO KEY UPDATE OF community`)
  for (const { id } of rows) {
    // oxlint-disable-next-line no-await-in-loop -- the bounded archive set is locked and settled in global community order.
    await archiveOwnedCommunity(query, id, ownerUserId) // no-mistakes-disable-line query-reached-per-item: bounded locked archive page delegates to the canonical per-community archive service.
  }
  return rows.map(row => row.id)
}

async function archiveOwnedCommunity(
  query: TransactionQuery,
  communityId: string,
  ownerUserId: string,
): Promise<void> {
  await archiveCommunity(communityId, null, { query })
  await query(sql`/* cleanupUserOwnedCommunities:removeArchivedOwner */
    UPDATE community_members SET removed_at = CURRENT_TIMESTAMP
    WHERE community_id = ${communityId} AND user_id = ${ownerUserId}
      AND role = 'owner' AND removed_at IS NULL`)
}
