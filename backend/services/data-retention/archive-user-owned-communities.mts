import type { TransactionQuery } from '@data-stores/psql'
import { archiveCommunities } from '@services/communities/archive'
import sql from 'sql-template-strings'

/** Locks the still-owned communities in id order, archives them together, then removes the owner. */
export async function archiveUserOwnedCommunities(
  query: TransactionQuery,
  ownerUserId: string,
  communityIds: readonly string[],
): Promise<string[]> {
  if (communityIds.length === 0) return []
  const sortedIds = [...communityIds].toSorted()
  const { rows } = await query<{ id: string }>(sql`/* cleanupUserOwnedCommunities:lockForArchive */
    SELECT community.id FROM communities community
    WHERE community.id = ANY(${sortedIds}::uuid[])
      AND EXISTS (
        SELECT 1 FROM community_members owner
        WHERE owner.community_id = community.id AND owner.user_id = ${ownerUserId}
          AND owner.role = 'owner' AND owner.removed_at IS NULL
      )
    ORDER BY community.id FOR NO KEY UPDATE OF community`)
  const lockedIds = rows.map(row => row.id)
  if (lockedIds.length === 0) return []
  await archiveCommunities(lockedIds, null, { query })
  await query(sql`/* cleanupUserOwnedCommunities:removeArchivedOwners */
    UPDATE community_members SET removed_at = CURRENT_TIMESTAMP
    WHERE community_id = ANY(${lockedIds}::uuid[]) AND user_id = ${ownerUserId}
      AND role = 'owner' AND removed_at IS NULL`)
  return lockedIds
}
