import { read } from '@data-stores/psql'
import type { QueryExecutor, QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { CommunityMember } from '../types.mts'

export async function getCommunityMemberBatch(
  userId: string,
  communityIds: string[],
  options?: QueryOptions,
): Promise<Record<string, CommunityMember>> {
  if (communityIds.length === 0) return {}
  const execute = (query: QueryExecutor) =>
    query<CommunityMember>(
      sql`/* getCommunityMemberBatch */
    SELECT id, community_id, user_id, role,
      should_suppress_community_digests_while_on_vacation, approved_by_id,
      created_at, updated_at, removed_at, removed_by_id,
      suspected_ban_evader_at, suspected_ban_evader_source_user_id,
      suspected_ban_evader_score, suspected_ban_evader_dismissed_at,
      suspected_ban_evader_dismissed_by_id
    FROM community_members
    WHERE user_id = ${userId}
      AND community_id = ANY(${communityIds}::uuid[])
      AND removed_at IS NULL
    `,
    )
  const { rows } = await execute(options?.query ?? read)
  return Object.fromEntries(rows.map((r: CommunityMember) => [r.community_id, r]))
}
