import { escapeLikePattern } from '@modules/search-utils'
import { read } from '@data-stores/psql'

export type SearchedTopicAlias = {
  topic_id: string
  alias: string
  topic: { id: string; name: string; slug: string; topic_type: string }
}

export const searchTopicAliases = async ({
  prefixQuery,
  textQuery,
  topicId,
  limit: rawLimit,
  after,
}: {
  prefixQuery?: string
  textQuery?: string
  topicId?: string
  limit?: number
  after?: string
}): Promise<{ results: SearchedTopicAlias[]; hasNextPage: boolean; endAlias: string | null }> => {
  const limit = Math.max(1, Math.min(100, rawLimit ?? 24))
  const values: (string | number)[] = []
  const filters: string[] = []

  if (prefixQuery) {
    filters.push(
      `LOWER(topic_aliases.alias) ILIKE $${values.push(`${escapeLikePattern(prefixQuery.trim().toLowerCase())}%`)} ESCAPE '\\'`,
    )
  }
  if (textQuery) {
    filters.push(
      `topic_aliases.search_vector @@ websearch_to_tsquery('voucha_english', $${values.push(textQuery)})`,
    )
  }
  if (topicId) {
    filters.push(`topic_aliases.topic_id = $${values.push(topicId)}`)
  }
  if (after) {
    filters.push(`topic_aliases.alias > $${values.push(after)}`)
  }

  const limitParam = values.push(limit + 1)
  const query = `/* searchTopicAliases */
    SELECT
      topic_aliases.topic_id,
      topic_aliases.alias,
      json_build_object(
        'id', topics.id,
        'name', topics.name,
        'slug', topics.slug,
        'topic_type', topics.topic_type
      ) AS topic
    FROM topic_aliases
    JOIN topics
      ON topics.id = topic_aliases.topic_id
      AND topics.deleted_at IS NULL
    ${filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : ''}
    ORDER BY topic_aliases.alias
    LIMIT $${limitParam}
  `

  const { rows } = await read<SearchedTopicAlias>(query, values)
  const hasNextPage = rows.length > limit
  const results = rows.slice(0, limit)
  return {
    results,
    hasNextPage,
    endAlias: hasNextPage ? (results.at(-1)?.alias ?? null) : null,
  }
}

export function topicAliasSearchCursorScope(filters: {
  prefixQuery?: string
  textQuery?: string
  topicId?: string
}): string {
  return JSON.stringify({
    prefixQuery: filters.prefixQuery?.trim().toLowerCase() ?? null,
    textQuery: filters.textQuery?.trim().toLowerCase() ?? null,
    topicId: filters.topicId ?? null,
    order: 'alias-asc',
  })
}
