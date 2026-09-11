import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  SearchRecentAutomodActionsOptions,
  SearchRecentAutomodActionsResult,
} from './types.mts'
import { buildRecentAutomodActionsQuery } from './recent-actions-query.mts'
import { buildRecentAutomodActionsStatsQuery } from './recent-actions-stats-query.mts'
import {
  decodeRecentAutomodActionsCursor,
  encodeRecentAutomodActionsCursor,
  normalizeRecentAction,
  type RawRecentAutomodAction,
} from './recent-actions-utils.mts'
export { parseAutomodActionSourceKey } from './recent-actions-utils.mts'

export async function searchRecentAutomodActions(
  communityId: string,
  options: SearchRecentAutomodActionsOptions = {},
): Promise<SearchRecentAutomodActionsResult> {
  const limit = Math.min(Math.max(Math.floor(options.limit ?? 25), 1), 100)
  const baseQuery = buildRecentAutomodActionsQuery(communityId, options)
  const statsQuery = buildRecentAutomodActionsStatsQuery(communityId, options)
  const cursor = options.after ? decodeRecentAutomodActionsCursor(options.after) : null
  const query = sql`/* searchRecentAutomodActions:paged */
    WITH filtered_actions AS (
      `.append(baseQuery).append(sql`
    )
    SELECT *
    FROM filtered_actions
    WHERE true
      AND feedback_label IS NULL
  `)

  if (cursor) {
    if (cursor.confidenceScore === null) {
      query.append(sql`
        AND confidence_score IS NULL
        AND (
          action_at < ${cursor.actionAt}::timestamptz
          OR (action_at = ${cursor.actionAt}::timestamptz AND source_key < ${cursor.sourceKey})
        )
      `)
    } else {
      query.append(sql`
        AND (
          confidence_score > ${cursor.confidenceScore}
          OR confidence_score IS NULL
          OR (
            confidence_score = ${cursor.confidenceScore}
            AND (
              action_at < ${cursor.actionAt}::timestamptz
              OR (action_at = ${cursor.actionAt}::timestamptz AND source_key < ${cursor.sourceKey})
            )
          )
        )
      `)
    }
  }
  query.append(sql`
    ORDER BY confidence_score ASC NULLS LAST, action_at DESC, source_key DESC
    LIMIT ${limit + 1}
  `)

  const [{ rows }, { rows: statsRows }] = await Promise.all([read(query), read(statsQuery)])
  const rawActions = rows as RawRecentAutomodAction[]
  const stats = statsRows[0] as RawRecentAutomodAction | undefined
  const hasNextPage = rawActions.length > limit
  const pageRows = hasNextPage ? rawActions.slice(0, limit) : rawActions

  return {
    actions: pageRows.map(normalizeRecentAction),
    hasNextPage,
    endCursor:
      hasNextPage && pageRows.length > 0
        ? encodeRecentAutomodActionsCursor(pageRows[pageRows.length - 1]!)
        : null,
    stats: buildStats(stats),
  }
}

function buildStats(row: RawRecentAutomodAction | undefined) {
  const totalCount = Number(row?.total_count ?? 0)
  const falsePositiveCount = Number(row?.false_positive_count ?? 0)
  return {
    total_count: totalCount,
    false_positive_count: falsePositiveCount,
    false_positive_rate: totalCount > 0 ? falsePositiveCount / totalCount : 0,
  }
}
