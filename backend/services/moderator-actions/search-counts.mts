import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { buildPageInfo, decodeUuidCursor, isScoreCursor } from '@modules/pagination'
import { clampLimit } from '@services/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { buildModeratorActionCountsQuery } from './aggregate-query.mts'
import type { ModeratorActionCounts } from './types.mts'

/** Bounded actor page for MCP; the REST leaderboard keeps its aggregate contract. */
export async function searchModeratorActionCounts(
  options: QueryOptions & {
    communityId: string
    windowDays: 30 | 90
    limit?: number
    after?: string
  },
): Promise<{ stats: ModeratorActionCounts[]; page_info: PageInfo }> {
  const limit = Math.floor(clampLimit(options.limit, 25, 100))
  const cursor = options.after
    ? decodeUuidCursor(options.after, isScoreCursor, 'Invalid moderator statistics cursor')
    : undefined
  if (cursor) {
    assert(Number.isSafeInteger(cursor.score) && cursor.score > 0, 400, 'Invalid statistics score')
  }
  const query = sql`/* searchModeratorActionCounts */ WITH action_counts AS (`
  query.append(buildModeratorActionCountsQuery(options))
  query.append(sql`), actors AS (
    SELECT actor_user_id, SUM(count)::int AS total,
      jsonb_object_agg(action_type, count) AS counts
    FROM action_counts
    GROUP BY actor_user_id
  )
  SELECT actor_user_id, total, counts FROM actors
  WHERE TRUE`)
  if (cursor) {
    query.append(sql` AND (total, actor_user_id) < (${cursor.score}, ${cursor.id}::uuid)`)
  }
  query.append(sql` ORDER BY total DESC, actor_user_id DESC LIMIT ${limit + 1}`)
  const { rows } = await read<ModeratorActionCounts>(query, options)
  const stats = rows.slice(0, limit)
  return {
    stats,
    page_info: buildPageInfo(stats, {
      hasNextPage: rows.length > limit,
      getCursor: item => ({ id: item.actor_user_id, score: item.total }),
    }),
  }
}
