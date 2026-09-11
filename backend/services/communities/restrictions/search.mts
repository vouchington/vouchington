import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { decodeUuidCursor, encodeCursor, isScoreCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import sql from 'sql-template-strings'
import createHttpError from 'http-errors'
import assert from 'http-assert'
import type { CommunityRestriction } from '../types.mts'

type CommunityRestrictionSearchRow = CommunityRestriction & { active_score: 0 | 1 }

export async function searchCommunityRestrictions(
  communityId: string,
  options?: QueryOptions & { limit?: number; after?: string },
): Promise<{ results: CommunityRestriction[]; page_info: PageInfo }> {
  const limit = options?.limit ?? 20
  assert(Number.isInteger(limit), 422, 'limit must be an integer')
  assert(limit > 0 && limit <= 100, 422, 'limit must be between 1 and 100')

  let cursor: { id: string; activeScore: 0 | 1 } | undefined

  if (options?.after) {
    const decodedCursor = decodeUuidCursor(options.after, isScoreCursor, 'Invalid cursor format')
    if (decodedCursor.score !== 0 && decodedCursor.score !== 1) {
      throw createHttpError(400, 'Invalid cursor format')
    }
    cursor = {
      id: decodedCursor.id,
      activeScore: decodedCursor.score,
    }
  }

  const query = sql`/* searchCommunityRestrictions */
    SELECT *
    FROM (
      SELECT
        community_restrictions.*,
        CASE
          WHEN lifted_at IS NULL AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
            THEN 1
          ELSE 0
        END AS active_score
      FROM community_restrictions
      WHERE community_id = ${communityId}
    ) ranked_restrictions
    WHERE TRUE
  `

  if (cursor !== undefined) {
    query.append(sql`
      AND (
        active_score < ${cursor.activeScore}
        OR (active_score = ${cursor.activeScore} AND id < ${cursor.id})
      )
    `)
  }

  query.append(sql`
    ORDER BY active_score DESC, id DESC
    LIMIT ${limit + 1}
  `)

  const { rows } = await read(query, options)

  const hasNextPage = rows.length > limit
  const results: CommunityRestriction[] = []
  for (let i = 0; i < Math.min(rows.length, limit); i++) {
    results.push(toCommunityRestriction(rows[i]! as CommunityRestrictionSearchRow))
  }

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor:
        hasNextPage && results.length > 0
          ? encodeCursor({
              score: (rows[Math.min(rows.length, limit) - 1]! as CommunityRestrictionSearchRow)
                .active_score,
              id: results[results.length - 1]!.id,
            })
          : null,
      start_cursor:
        results.length > 0
          ? encodeCursor({
              score: (rows[0]! as CommunityRestrictionSearchRow).active_score,
              id: results[0]!.id,
            })
          : null,
    },
  }
}

function toCommunityRestriction(row: CommunityRestrictionSearchRow): CommunityRestriction {
  const { active_score: _activeScore, ...restriction } = row
  return restriction
}
