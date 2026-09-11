import { read } from '@data-stores/psql'
import { invalidate } from '@services/entity-cache/invalidate'
import sql from 'sql-template-strings'

export async function invalidateCommunityMemberUserMetrics(...userIds: string[]): Promise<void> {
  if (userIds.length === 0) return
  await invalidate.user_metrics(...userIds)
}

export async function invalidateAllCommunityMemberUserMetrics(communityId: string): Promise<void> {
  const { rows } = await read<{ user_id: string }>(sql`/* invalidateAllCommunityMemberUserMetrics */
    SELECT user_id
    FROM community_members
    WHERE community_id = ${communityId}
      AND removed_at IS NULL
  `)
  await invalidateCommunityMemberUserMetrics(...rows.map(row => row.user_id))
}
