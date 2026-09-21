import { read } from '@data-stores/psql'
import type { TopicRecommendationSearchOptions } from './types.mts'
import type { PostSearchResult } from '@services/posts/search/types'
import { decodeUuidCursor, isScoreCursor, buildPageInfo } from '@modules/pagination'
import onError from '@modules/on-error'
import { isUUID } from '@modules/utils/ids'

type SearchRow = {
  id: string
  post_type: 'topic_recommendation'
  vote_score: string | number
}

export async function searchTopicRecommendations(options: TopicRecommendationSearchOptions = {}) {
  try {
    const limit = Math.min(Math.max(options.limit ?? 25, 1), 100)
    const params: unknown[] = []
    const filters: string[] = [
      `posts.deleted_at IS NULL`,
      `posts.post_type = 'topic_recommendation'`,
    ]

    if (options.status === 'pending') {
      filters.push(`ptr.reviewed_at IS NULL`)
    } else if (options.status === 'approved') {
      filters.push(`ptr.reviewed_at IS NOT NULL`)
      filters.push(`ptr.created_topic_id IS NOT NULL`)
    } else if (options.status === 'rejected') {
      filters.push(`ptr.reviewed_at IS NOT NULL`)
      filters.push(`ptr.created_topic_id IS NULL`)
    }

    if (options.q?.trim()) {
      // posts.title/markdown route through the search_vector GIN index (FTS) instead of an
      // unindexed ILIKE scan across every posts partition. ptr.topic_title/topic_slug stay ILIKE
      // since post_topic_recommendations is small and unindexed substring matching there is cheap.
      const trimmedQuery = options.q.trim()
      const escapedQuery = trimmedQuery.replace(/[%_\\]/g, '\\$&')
      params.push(`%${escapedQuery}%`)
      const likeParam = params.length
      params.push(trimmedQuery)
      const tsQueryParam = params.length

      const disjuncts = [
        `posts.search_vector @@ websearch_to_tsquery('voucha_english', $${tsQueryParam})`,
        `ptr.topic_title ILIKE $${likeParam} ESCAPE '\\'`,
        `ptr.topic_slug ILIKE $${likeParam} ESCAPE '\\'`,
      ]

      if (isUUID(trimmedQuery)) {
        params.push(trimmedQuery)
        disjuncts.push(`posts.id = $${params.length}`)
      }

      filters.push(`(${disjuncts.join(' OR ')})`)
    }

    if (options.after) {
      const cursor = decodeUuidCursor(options.after, isScoreCursor, 'Invalid cursor for sort=best')
      params.push(cursor.score, cursor.id)
      const scoreParam = params.length - 1
      const idParam = params.length
      filters.push(`(posts.votes_score_sort, posts.id) < ($${scoreParam}, $${idParam})`)
    }

    params.push(limit + 1)

    const { rows } = await read(
      `/* searchTopicRecommendations */
      SELECT
        posts.id,
        posts.post_type,
        posts.votes_score_sort AS vote_score
      FROM posts
      JOIN post_topic_recommendations ptr ON ptr.post_id = posts.id
      WHERE ${filters.join(' AND ')}
      ORDER BY posts.votes_score_sort DESC, posts.id DESC
      LIMIT $${params.length}
    `,
      params,
    )

    const typedRows = rows as SearchRow[]
    const hasNextPage = typedRows.length > limit
    const resultRows = typedRows.slice(0, limit)
    const results: PostSearchResult[] = resultRows.map(row => ({
      __entity_type: 'post',
      id: row.id,
      post_type: row.post_type,
    }))

    return {
      results,
      page_info: buildPageInfo(resultRows, {
        hasNextPage,
        getCursor: row => ({ score: Number(row.vote_score), id: row.id }),
      }),
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    ;(
      err as Error & {
        extra?: Record<string, unknown>
        tags?: Record<string, string>
      }
    ).extra = { function: 'searchTopicRecommendations', options }
    ;(err as Error & { tags?: Record<string, string> }).tags = {
      path: 'search-topic-recommendations',
    }
    onError(err)
    throw err
  }
}
