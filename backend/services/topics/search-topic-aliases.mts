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
      `LOWER(alias) ILIKE $${values.push(`${escapeLikePattern(prefixQuery.trim().toLowerCase())}%`)} ESCAPE '\\'`,
    )
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

  const limitParam = values.push(limit + 1)
  const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : ''
  const query = `/* searchTopicAliases */
    WITH alias_page AS MATERIALIZED (
      SELECT topic_aliases.topic_id, topic_aliases.alias
      FROM topic_aliases
      ${where}
      ORDER BY alias
      LIMIT $${limitParam}
    )
    SELECT
      page.topic_id,
      page.alias,
      json_build_object(
        'id', topics.id,
        'name', topics.name,
        'slug', topics.slug,
        'topic_type', topics.topic_type
      ) AS topic,
      (topics.id IS NOT NULL) AS kept
    FROM alias_page page
    LEFT JOIN LATERAL (
      SELECT live.id, live.name, live.slug, live.topic_type
      FROM topics live
      WHERE live.id = page.topic_id
        AND live.deleted_at IS NULL
      LIMIT 1
    ) topics ON TRUE
    ORDER BY page.alias
  `

  const { rows } = await read<SearchedTopicAlias & { kept: boolean }>(query, values)
  const hasNextPage = rows.length > limit
  const inspected = rows.slice(0, limit)
  const results = inspected.flatMap(row => {
    if (!row.kept) return []
    const { kept, ...alias } = row
    return [alias]
  })
  return { results, hasNextPage, endAlias: hasNextPage ? (inspected.at(-1)?.alias ?? null) : null }
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
