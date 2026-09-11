import { read } from '@data-stores/psql'
import { maskHashtagBearingUrls } from '@modules/utils'
import { normalizeHashtag } from '@ts-shared/utils'
import createHttpError from 'http-errors'

const MAX_HASHTAG_TOPIC_MENTIONS = 10

// Retained for API error-shaping compatibility; unresolved valid hashtags no longer throw it.
export class HashtagTopicSearchError extends Error {
  status = 400
  error: string

  constructor(raw: string) {
    const message = `Topic not found: ${raw}`
    super(message)
    this.name = 'HashtagTopicSearchError'
    this.error = message
  }
}
export function isHashtagTopicSearchError(error: unknown): error is HashtagTopicSearchError {
  return error instanceof HashtagTopicSearchError
}

export type HashtagSearchFilter =
  | { kind: 'linked_topic'; topicId: string }
  | { kind: 'exact_alias'; aliasId: string }

type HashtagTopicSearchResult = {
  filters: HashtagSearchFilter[]
  hasUnknown: boolean
  textSearchQuery?: string
  topicIds: string[]
}

export async function resolveHashtagTopicSearch(
  rawQuery: unknown,
): Promise<HashtagTopicSearchResult> {
  if (typeof rawQuery !== 'string' || rawQuery.trim().length === 0) {
    return { filters: [], hasUnknown: false, topicIds: [] }
  }
  const hashtagMatches = findSearchHashtags(rawQuery)
  const rawTags = hashtagMatches.map(match => match[2]!.replace(/[._-]+$/, ''))
  if (rawTags.length === 0)
    return { filters: [], hasUnknown: false, textSearchQuery: rawQuery, topicIds: [] }
  if (rawTags.length > MAX_HASHTAG_TOPIC_MENTIONS)
    throw createHttpError(
      422,
      `Too many hashtag topic identifiers (max ${MAX_HASHTAG_TOPIC_MENTIONS})`,
    )
  const tags = rawTags.map(raw => {
    const normalized = normalizeHashtag(raw)
    if (!normalized) throw createHttpError(422, `Invalid hashtag: ${raw}`)
    return normalized
  })
  const { rows } = await read<{ id: string | null; alias: string; topic_id: string | null }>(
    `/* resolveHashtagTopicSearch */
    WITH candidates AS (
      SELECT
        topic_aliases.id,
        topic_aliases.alias,
        CASE
          WHEN topics.id IS NULL THEN NULL
          ELSE topic_aliases.topic_id
        END AS topic_id
      FROM topic_aliases
      LEFT JOIN topics
        ON topics.id = topic_aliases.topic_id
        AND topics.deleted_at IS NULL
        AND topics.merged_into_topic_id IS NULL
      WHERE topic_aliases.alias = ANY($1::text[])

      UNION ALL

      SELECT
        NULL AS id,
        topics.slug AS alias,
        topics.id AS topic_id
      FROM topics
      WHERE topics.slug = ANY($1::text[])
        AND topics.deleted_at IS NULL
        AND topics.merged_into_topic_id IS NULL
    )
    SELECT DISTINCT ON (alias) id, alias, topic_id
    FROM candidates
    ORDER BY
      alias,
      CASE
        WHEN id IS NOT NULL AND topic_id IS NOT NULL THEN 2
        WHEN id IS NULL THEN 1
        ELSE 0
      END DESC`,
    [[...new Set(tags.map(tag => tag.key))]],
  )
  const aliases = new Map(rows.map(row => [row.alias, row]))
  const filters: HashtagSearchFilter[] = []
  let hasUnknown = false
  for (const tag of tags) {
    const alias = aliases.get(tag.key)
    if (!alias) {
      hasUnknown = true
      continue
    }
    if (alias.topic_id) {
      filters.push({ kind: 'linked_topic', topicId: alias.topic_id })
    } else if (alias.id) {
      filters.push({ kind: 'exact_alias', aliasId: alias.id })
    } else {
      hasUnknown = true
    }
  }

  return {
    filters,
    hasUnknown,
    textSearchQuery: removeSearchHashtags(rawQuery, hashtagMatches),
    topicIds: [
      ...new Set(
        filters.flatMap(filter => (filter.kind === 'linked_topic' ? [filter.topicId] : [])),
      ),
    ],
  }
}

function findSearchHashtags(rawQuery: string): RegExpMatchArray[] {
  const searchable = maskHashtagBearingUrls(rawQuery)
  return [...searchable.matchAll(/(^|[^A-Za-z0-9_-])(#[A-Za-z0-9._-]+)(?=$|[^\p{L}\p{N}_-])/gu)]
}

function removeSearchHashtags(rawQuery: string, matches: RegExpMatchArray[]): string | undefined {
  const text = rawQuery.split('')
  for (const match of matches) {
    const start = match.index! + match[1]!.length
    text.fill(' ', start, start + match[2]!.length)
  }
  return text.join('').replace(/\s+/g, ' ').trim() || undefined
}
