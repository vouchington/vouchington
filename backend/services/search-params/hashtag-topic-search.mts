import { createSearchCache } from '@services/entity-cache/search-cache'
import { read } from '@data-stores/psql'
import { maskHashtagBearingUrls } from '@modules/utils'
import { normalizeHashtag } from '@ts-shared/utils'
import { parseStringArray } from '@ts-shared/utils/query'
import createHttpError from 'http-errors'

const MAX_HASHTAG_TOPIC_MENTIONS = 10
export const MAX_TOPIC_SEARCH_TERMS = 5

export type HashtagSearchFilter =
  | { kind: 'linked_topic'; topicId: string }
  | { kind: 'exact_alias'; aliasId: string }

type HashtagTopicSearchResult = {
  filters: HashtagSearchFilter[]
  hasUnknown: boolean
  textSearchQuery?: string
  topicIds: string[]
}

const getHashtagTopicsCached = createSearchCache(
  'hashtag_topics_anon',
  async ({ keys }: { keys: string[] }) => {
    const { rows } = await read<{ id: string | null; alias: string; topic_id: string | null }>(
      `/* resolveHashtagTopicSearch */
    SELECT keys.alias,
      CASE WHEN alias_topic.id IS NOT NULL THEN topic_aliases.id
           WHEN direct_topic.id IS NOT NULL THEN NULL
           ELSE topic_aliases.id END AS id,
      COALESCE(alias_topic.id, direct_topic.id) AS topic_id
    FROM unnest($1::text[]) AS keys(alias)
    LEFT JOIN topic_aliases ON topic_aliases.alias = keys.alias
    LEFT JOIN topics alias_topic
      ON alias_topic.id = topic_aliases.topic_id
      AND alias_topic.deleted_at IS NULL
      AND alias_topic.merged_into_topic_id IS NULL
    LEFT JOIN topics direct_topic
      ON direct_topic.slug = keys.alias
      AND direct_topic.deleted_at IS NULL
      AND direct_topic.merged_into_topic_id IS NULL`,
      [keys],
    )
    return rows
  },
)

/** Bounds raw topic inputs before deduplication or reference resolution. */
export function validateTopicSearchTerms(
  query: Record<string, unknown>,
  fields: readonly string[],
  includeHashtags = false,
): void {
  const hashtagCount =
    includeHashtags && typeof query.q === 'string' ? findSearchHashtags(query.q).length : 0
  if (hashtagCount > MAX_TOPIC_SEARCH_TERMS)
    assertHashtagCount(hashtagCount, MAX_TOPIC_SEARCH_TERMS, 400)
  const count = fields.reduce(
    (total, field) => total + parseStringArray(query[field]).length,
    hashtagCount,
  )
  if (count > MAX_TOPIC_SEARCH_TERMS)
    throw createHttpError(400, `Too many topic identifiers (max ${MAX_TOPIC_SEARCH_TERMS})`)
}

function assertHashtagCount(count: number, maxMentions: number, status: 400 | 422): void {
  if (count > maxMentions)
    throw createHttpError(status, `Too many hashtag topic identifiers (max ${maxMentions})`)
}

export async function resolveHashtagTopicSearch(
  rawQuery: unknown,
  options: { maxMentions?: number; limitStatus?: 400 | 422 } = {},
): Promise<HashtagTopicSearchResult> {
  if (typeof rawQuery !== 'string' || rawQuery.trim().length === 0) {
    return { filters: [], hasUnknown: false, topicIds: [] }
  }
  const hashtagMatches = findSearchHashtags(rawQuery)
  const rawTags = hashtagMatches.map(match => match[2]!.replace(/[._-]+$/, ''))
  if (rawTags.length === 0)
    return { filters: [], hasUnknown: false, textSearchQuery: rawQuery, topicIds: [] }
  const maxMentions = options.maxMentions ?? MAX_HASHTAG_TOPIC_MENTIONS
  assertHashtagCount(rawTags.length, maxMentions, options.limitStatus ?? 422)
  const tags = rawTags.map(raw => {
    const normalized = normalizeHashtag(raw)
    if (!normalized) throw createHttpError(422, `Invalid hashtag: ${raw}`)
    return normalized
  })
  const keys = [...new Set(tags.map(tag => tag.key))].toSorted()
  const rows = await getHashtagTopicsCached({ keys })
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
  return [
    ...searchable.matchAll(/(^|[^A-Za-z0-9_-])(#[A-Za-z0-9._-]+)(?=$|[^\p{L}\p{M}\p{N}_-])/gu),
  ]
}

function removeSearchHashtags(rawQuery: string, matches: RegExpMatchArray[]): string | undefined {
  const text = rawQuery.split('')
  for (const match of matches) {
    const start = match.index! + match[1]!.length
    text.fill(' ', start, start + match[2]!.length)
  }
  return text.join('').replace(/\s+/g, ' ').trim() || undefined
}
