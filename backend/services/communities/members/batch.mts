import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { CommunityMember } from '../types.mts'

export async function getCommunityMemberBatch(
  userId: string,
  communityIds: string[],
  options?: QueryOptions,
): Promise<Record<string, CommunityMember>> {
  if (communityIds.length === 0) return {}
  const { rows } = await (options?.query ?? read)(
    sql`/* getCommunityMemberBatch */
    SELECT * FROM community_members
    WHERE user_id = ${userId}
      AND community_id = ANY(${communityIds}::uuid[])
      AND removed_at IS NULL
    `,
  )
  return Object.fromEntries(rows.map((r: CommunityMember) => [r.community_id, r]))
}
