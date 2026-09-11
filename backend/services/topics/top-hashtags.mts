import { read } from '@data-stores/psql'
import { normalizeHashtagQuery } from '@ts-shared/utils'
import { escapeLikePattern } from './search/query-builder-utils.mts'

export type TopHashtagMapping = 'all' | 'linked' | 'unlinked'

export type TopHashtag = {
  topic_alias_id: string
  hashtag: string
  item_count: number
  contributor_count: number
  latest_content_id: string
  topic_id: string | null
}

export type TopHashtagCursor = {
  item_count: number
  latest_content_at: Date | string
  latest_content_id: string
  topic_alias_id: string
}

export type TopHashtagSearchResult = TopHashtag & { latest_content_at: Date }

type TopHashtagRow = Omit<TopHashtagSearchResult, 'item_count' | 'contributor_count'> & {
  item_count: string | number
  contributor_count: string | number
}

export async function searchTopHashtags(options: {
  q?: string
  mapping?: TopHashtagMapping
  after?: TopHashtagCursor
  limit?: number
}): Promise<{ results: TopHashtagSearchResult[]; hasNextPage: boolean }> {
  const limit = Math.max(1, Math.min(100, options.limit ?? 25))
  const values: Array<string | number | Date> = []
  const filters: string[] = []
  const q = options.q ? escapeLikePattern(normalizeHashtagQuery(options.q)) : ''
  if (q) {
    filters.push(
      `(hashtags.display_hashtag ILIKE $${values.push(`%${q}%`)} ESCAPE '\\' OR aliases.alias ILIKE $${values.push(`%${q}%`)} ESCAPE '\\')`,
    )
  }
  if (options.mapping === 'linked') filters.push('active_topic.id IS NOT NULL')
  if (options.mapping === 'unlinked') filters.push('active_topic.id IS NULL')
  if (options.after) {
    filters.push(
      `(hashtags.item_count, hashtags.latest_content_at, hashtags.latest_content_id, hashtags.topic_alias_id) < ($${values.push(options.after.item_count)}, $${values.push(options.after.latest_content_at)}::timestamptz, $${values.push(options.after.latest_content_id)}::uuid, $${values.push(options.after.topic_alias_id)}::uuid)`,
    )
  }
  const { rows } = await read<TopHashtagRow>(
    `/* searchTopHashtags */
      SELECT
        hashtags.topic_alias_id,
        hashtags.display_hashtag AS hashtag,
        hashtags.item_count,
        hashtags.contributor_count,
        hashtags.latest_content_at,
        hashtags.latest_content_id,
        active_topic.id AS topic_id
      FROM mv_top_hashtags hashtags
      JOIN topic_aliases aliases ON aliases.id = hashtags.topic_alias_id
      LEFT JOIN topics active_topic
        ON active_topic.id = aliases.topic_id
        AND active_topic.deleted_at IS NULL
        AND active_topic.merged_into_topic_id IS NULL
      ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
      ORDER BY hashtags.item_count DESC, hashtags.latest_content_at DESC, hashtags.latest_content_id DESC, hashtags.topic_alias_id DESC
      LIMIT $${values.push(limit + 1)}`,
    values,
  )
  return {
    results: rows.slice(0, limit).map(row => ({
      ...row,
      item_count: Number(row.item_count),
      contributor_count: Number(row.contributor_count),
    })),
    hasNextPage: rows.length > limit,
  }
}

export function topHashtagsCursorScope(options: {
  q?: string
  mapping?: TopHashtagMapping
}): string {
  return JSON.stringify({
    q: options.q ? normalizeHashtagQuery(options.q) : null,
    mapping: options.mapping ?? 'all',
  })
}
