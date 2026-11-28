import { escapeLikePattern } from '@modules/search-utils'
import { read } from '@data-stores/psql'

export type SearchedTopicAlias = {
  topic_id: string
  alias: string
  topic: { id: string; name: string; slug: string; topic_type: string }
}

const MAX_UNICODE_CODE_POINT = 0x10ffff

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
  const trimmedPrefix = prefixQuery?.trim() ?? ''
  const values: (string | number)[] = []
  const filters: string[] = []

  if (trimmedPrefix.length > 0) {
    const rawPrefixParam = `$${values.push(trimmedPrefix)}::text`
    const escapedPrefixParam = `$${values.push(escapeLikePattern(trimmedPrefix))}::text`
    const hasUpperBound = Array.from(trimmedPrefix).some(
      ch => (ch.codePointAt(0) ?? 0) < MAX_UNICODE_CODE_POINT,
    )
    filters.push(`topic_aliases.alias COLLATE "C" >= LOWER(${rawPrefixParam}) COLLATE "C"`)
    if (hasUpperBound) {
      filters.push(
        `topic_aliases.alias COLLATE "C" < (left(rtrim(LOWER(${rawPrefixParam}), chr(1114111)), -1) || chr(CASE WHEN ascii(right(rtrim(LOWER(${rawPrefixParam}), chr(1114111)), 1)) = 55295 THEN 57344 ELSE ascii(right(rtrim(LOWER(${rawPrefixParam}), chr(1114111)), 1)) + 1 END)) COLLATE "C"`,
      )
    }
    filters.push(`topic_aliases.alias LIKE LOWER(${escapedPrefixParam}) || '%' ESCAPE '\\'`)
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
    filters.push(`topic_aliases.alias COLLATE "C" > $${values.push(after)}::text COLLATE "C"`)
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
    ${filters.length > 0 ? `WHERE ${filters.join('\n      AND ')}` : ''}
    ORDER BY topic_aliases.alias COLLATE "C"
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
