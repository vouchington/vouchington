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

  const query =
    trimmedPrefix.length > 0
      ? buildPrefixQuery({ trimmedPrefix, textQuery, topicId, after, limit, values })
      : buildUnprefixedQuery({ textQuery, topicId, after, limit, values })

  const { rows } = await read<SearchedTopicAlias>(query, values)
  const hasNextPage = rows.length > limit
  const results = rows.slice(0, limit)
  return {
    results,
    hasNextPage,
    endAlias: hasNextPage ? (results.at(-1)?.alias ?? null) : null,
  }
}

function buildPrefixQuery({
  trimmedPrefix,
  textQuery,
  topicId,
  after,
  limit,
  values,
}: {
  trimmedPrefix: string
  textQuery?: string
  topicId?: string
  after?: string
  limit: number
  values: (string | number)[]
}): string {
  const rawPrefixParam = `$${values.push(trimmedPrefix)}::text`
  const escapedPrefixParam = `$${values.push(escapeLikePattern(trimmedPrefix))}::text`
  const hasUpperBound = Array.from(trimmedPrefix).some(
    ch => (ch.codePointAt(0) ?? 0) < MAX_UNICODE_CODE_POINT,
  )
  const upperInput = hasUpperBound
    ? `,
          left(lowered.trimmed_max, -1) || chr(
            CASE
              WHEN ascii(right(lowered.trimmed_max, 1)) = 55295 THEN 57344
              ELSE ascii(right(lowered.trimmed_max, 1)) + 1
            END
          ) AS upper_prefix`
    : ''
  const afterInput = after ? `, $${values.push(after)}::text AS after` : ''

  const joinFilters = [
    'topic_aliases.topic_id IS NOT NULL',
    'topic_aliases.alias ~>=~ search_input.prefix',
    ...(hasUpperBound ? ['topic_aliases.alias ~<~ search_input.upper_prefix'] : []),
    `topic_aliases.alias LIKE search_input.pattern ESCAPE '\\'`,
    ...(after ? ['topic_aliases.alias > search_input.after'] : []),
  ]
  if (textQuery) {
    joinFilters.push(
      `topic_aliases.search_vector @@ websearch_to_tsquery('voucha_english', $${values.push(textQuery)})`,
    )
  }
  if (topicId) {
    joinFilters.push(`topic_aliases.topic_id = $${values.push(topicId)}`)
  }

  const limitParam = values.push(limit + 1)
  // Materialize the SQL-lowered text_pattern_ops bounds so PostgreSQL uses
  // idx_topic_aliases__alias__text_pattern_ops in both custom and generic prepared plans,
  // then sort matched aliases before hydrating active topics via LATERAL up to LIMIT.
  return `/* searchTopicAliases */
    WITH search_input AS MATERIALIZED (
      SELECT
        lowered.prefix${upperInput},
        LOWER(${escapedPrefixParam}) || '%' AS pattern${afterInput}
      FROM (
        SELECT
          LOWER(${rawPrefixParam}) AS prefix,
          rtrim(LOWER(${rawPrefixParam}), chr(1114111)) AS trimmed_max
      ) lowered
    ),
    ordered_aliases AS (
      SELECT
        topic_aliases.topic_id,
        topic_aliases.alias
      FROM search_input
      JOIN topic_aliases
        ON ${joinFilters.join('\n        AND ')}
      ORDER BY topic_aliases.alias
    )
    SELECT
      ordered_aliases.topic_id,
      ordered_aliases.alias,
      json_build_object(
        'id', topics.id,
        'name', topics.name,
        'slug', topics.slug,
        'topic_type', topics.topic_type
      ) AS topic
    FROM ordered_aliases
    JOIN LATERAL (
      SELECT
        topics.id,
        topics.name,
        topics.slug,
        topics.topic_type
      FROM topics
      WHERE topics.id = ordered_aliases.topic_id
        AND topics.deleted_at IS NULL
    ) topics ON TRUE
    ORDER BY ordered_aliases.alias
    LIMIT $${limitParam}
  `
}

function buildUnprefixedQuery({
  textQuery,
  topicId,
  after,
  limit,
  values,
}: {
  textQuery?: string
  topicId?: string
  after?: string
  limit: number
  values: (string | number)[]
}): string {
  const filters: string[] = []
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
  return `/* searchTopicAliases */
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
