import type { PrivateUser } from '@services/users/types'
import type { RecommendedTopicsSearchOptions, RecommendedTopicResult } from './types.mts'
import type { PageInfo } from '@voucha/types/pagination'
import { read } from '@data-stores/psql'
import { clampLimit } from '@modules/search-utils'
import {
  encodeCursor,
  decodeUuidCursor,
  isScoreCursor,
  isNameCursor,
  type ScoreCursor,
  type NameCursor,
} from '@modules/pagination'
import { buildRecommendationQuery } from './query-builder.mts'

type RecommendedTopicRow = {
  topic_id: string
  score: number
  reason: string
  name?: string
}

type RecommendedTopicsResponse = {
  results: Array<RecommendedTopicResult>
  page_info: PageInfo
}

export async function getRecommendedTopics(
  currentUser: PrivateUser,
  options: RecommendedTopicsSearchOptions = {},
): Promise<RecommendedTopicsResponse> {
  const limit = clampLimit(options.limit)
  const sort = options.sort ?? 'score'

  // Decode cursor if provided
  let score_lt: number | undefined
  let id_gt: string | undefined
  let name_gt: string | undefined

  if (options.after) {
    if (sort === 'best') {
      const cursor = decodeUuidCursor(
        options.after,
        isNameCursor,
        'Invalid cursor for best sorting',
      )
      name_gt = cursor.name
      id_gt = cursor.id
    } else {
      const cursor = decodeUuidCursor(
        options.after,
        isScoreCursor,
        'Invalid cursor for score sorting',
      )
      score_lt = cursor.score
      id_gt = cursor.id
    }
  }

  // Build the recommendation query
  const query = await buildRecommendationQuery(currentUser.id, {
    ...options,
    score_lt,
    id_gt,
    name_gt,
    limit: limit + 1,
  })

  const { rows } = await read(query)
  const typedRows = rows as RecommendedTopicRow[]

  // Detect if there's a next page
  const hasNextPage = typedRows.length > limit
  const resultRows = typedRows.slice(0, limit)

  // Map results with proper __entity_type
  const results: Array<RecommendedTopicResult> = resultRows.map(row => ({
    __entity_type: 'topic' as const,
    id: row.topic_id,
    score: row.score,
    reason: row.reason,
  }))

  // Build cursors
  let endCursor: string | null = null
  let startCursor: string | null = null

  if (resultRows.length > 0) {
    const firstRow = resultRows.at(0)
    const lastRow = resultRows.at(-1)

    if (firstRow) {
      if (sort === 'best') {
        // For best sort, we need the topic name from the query
        // Get the name from entity cache or directly from the row
        const topicName = firstRow.name
        if (!topicName) {
          throw new Error('Topic name not available for best sort cursor')
        }
        const cursor: NameCursor = { name: topicName, id: firstRow.topic_id }
        startCursor = encodeCursor(cursor)
      } else {
        const cursor: ScoreCursor = {
          score: firstRow.score,
          id: firstRow.topic_id,
        }
        startCursor = encodeCursor(cursor)
      }
    }

    if (hasNextPage && lastRow) {
      if (sort === 'best') {
        const topicName = lastRow.name
        if (!topicName) {
          throw new Error('Topic name not available for best sort cursor')
        }
        const cursor: NameCursor = { name: topicName, id: lastRow.topic_id }
        endCursor = encodeCursor(cursor)
      } else {
        const cursor: ScoreCursor = {
          score: lastRow.score,
          id: lastRow.topic_id,
        }
        endCursor = encodeCursor(cursor)
      }
    }
  }

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor: endCursor,
      start_cursor: startCursor,
    },
  }
}
