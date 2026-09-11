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
}): Promise<{ results: SearchedTopicAlias[]; hasNextPage: boolean }> => {
  const limit = Math.max(1, Math.min(100, rawLimit ?? 24))
  const values: (string | number)[] = []
  const filters: string[] = []

  if (prefixQuery) {
    filters.push(`LOWER(alias) ILIKE $${values.push(`${prefixQuery.trim().toLowerCase()}%`)}`)
  }
  if (textQuery) {
    filters.push(
      `topic_aliases.search_vector @@ websearch_to_tsquery('voucha_english', $${values.push(textQuery)})`,
    )
  }
  if (topicId) {
    filters.push(`topic_id = $${values.push(topicId)}`)
  }
  if (after) {
    filters.push(`alias > $${values.push(after)}`)
  }

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
      AND topics.merged_into_topic_id IS NULL
    ${filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : ''}
    ORDER BY alias
    LIMIT $${values.push(limit + 1)}
  `

  const { rows } = await read<SearchedTopicAlias>(query, values)
  const hasNextPage = rows.length > limit
  const results = rows.slice(0, limit)
  return { results, hasNextPage }
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
