import { read } from '@data-stores/psql'
import type { QueryExecutor, QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { CommunityApplication } from '../types.mts'
import { communityApplicationColumns } from './columns.mts'

export async function getPendingApplicationForUser(
  communityId: string,
  userId: string,
  options?: QueryOptions,
): Promise<CommunityApplication | null> {
  const execute = (query: QueryExecutor) =>
    query<CommunityApplication>(
      sql`/* getPendingApplicationForUser */
    SELECT `
        .append(communityApplicationColumns)
        .append(
          sql`
    FROM community_applications
    WHERE community_id = ${communityId}
      AND user_id = ${userId}
      AND approved_at IS NULL
      AND rejected_at IS NULL
    LIMIT 1
    `,
        ),
    )
  const { rows } = await execute(options?.query ?? read)
  return rows[0] ?? null
}

export async function getPendingApplicationCommunityIds(
  userId: string,
  communityIds: string[],
  options?: QueryOptions,
): Promise<Set<string>> {
  if (communityIds.length === 0) return new Set()
  const execute = (query: QueryExecutor) =>
    query<{ community_id: string }>(
      sql`/* getPendingApplicationCommunityIds */
    SELECT DISTINCT community_id FROM community_applications
    WHERE user_id = ${userId}
      AND community_id = ANY(${communityIds}::uuid[])
      AND approved_at IS NULL
      AND rejected_at IS NULL
    `,
    )
  const { rows } = await execute(options?.query ?? read)
  return new Set(rows.map((r: { community_id: string }) => r.community_id))
}
