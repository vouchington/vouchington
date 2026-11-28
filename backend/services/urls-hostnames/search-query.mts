import { decodeUuidCursor, isNameCursor, isScoreCursor } from '@modules/pagination'
import { escapeLikePattern } from '@modules/search-utils'
import { appendTopicDescendantsCte } from '@voucha/types/entities/topic-descendants'
import sql from 'sql-template-strings'
import { appendDescendantRootFilter, topicFilters } from './search-topic-filters.mts'
import type { SearchUrlHostnamesOptions } from './search-types.mts'

export function buildSearchUrlHostnamesQueryBody(options: SearchUrlHostnamesOptions) {
  const { limit, topic_id, topic_ids = [], include_descendants = false, sort } = options
  const effectiveLimit = limit || 50
  const effectiveTopicIds = Array.from(new Set(topic_id ? [topic_id] : topic_ids))
  const textQuery = options.query || options.hostname
  const walkTopics = effectiveTopicIds.length > 0 && include_descendants && !textQuery
  const filters = buildSearchFilters(options, effectiveTopicIds, walkTopics, textQuery)
  const searchQuery = sql``

  if (effectiveTopicIds.length > 0 && include_descendants) {
    searchQuery.append(sql`WITH RECURSIVE `)
    appendTopicDescendantsCte(searchQuery, effectiveTopicIds)
  } else {
    searchQuery.append(sql`WITH `)
  }

  const order =
    sort === 'trust' ? sql`h.votes_score_sort DESC, h.id DESC` : sql`h.hostname ASC, h.id ASC`
  searchQuery.append(sql`
    candidate_hostnames AS MATERIALIZED (
    SELECT h.id, h.hostname, h.votes_score_sort
  `)
  if (walkTopics) {
    // One keyed top-N read per matching topic, so a page never scans hostnames outside its topics.
    searchQuery.append(sql`FROM (
      SELECT DISTINCT topic_descendants.topic_id FROM topic_descendants`)
    appendDescendantRootFilter(searchQuery, options, effectiveTopicIds)
    searchQuery.append(sql`) matched_topic
      JOIN LATERAL (
        SELECT h.id, h.hostname, h.votes_score_sort FROM url_hostnames h`)
    appendWhereClause(searchQuery, [sql`h.topic_id = matched_topic.topic_id`, ...filters])
    searchQuery.append(sql` ORDER BY `).append(order)
    searchQuery.append(sql` LIMIT ${effectiveLimit + 1}
      ) h ON true`)
  } else {
    searchQuery.append(sql`FROM url_hostnames h`)
  }

  if (!walkTopics) appendWhereClause(searchQuery, filters)
  searchQuery.append(sql` ORDER BY `).append(order)
  searchQuery.append(sql` LIMIT ${effectiveLimit + 1}`)
  searchQuery.append(sql`
    )
    SELECT hydrated.*, candidate.votes_score_sort AS cursor_score
    FROM candidate_hostnames candidate
    JOIN LATERAL (
      SELECT * FROM view_url_hostnames WHERE id = candidate.id LIMIT 1
    ) hydrated ON true
    ORDER BY `)
  searchQuery.append(
    sort === 'trust'
      ? sql`candidate.votes_score_sort DESC, candidate.id DESC`
      : sql`candidate.hostname ASC, candidate.id ASC`,
  )

  return { effectiveLimit, searchQuery }
}

function buildSearchFilters(
  options: SearchUrlHostnamesOptions,
  effectiveTopicIds: string[],
  walkTopics: boolean,
  textQuery: string | undefined,
): ReturnType<typeof sql>[] {
  return [
    ...(typeof textQuery === 'string' && textQuery
      ? [sql`h.hostname ILIKE ${`%${escapeLikePattern(textQuery.toLowerCase())}%`} ESCAPE '\\'`]
      : []),
    ...(options.includePrivate ? [] : [sql`h.publicly_introduced_at IS NOT NULL`]),
    ...booleanFilter('is_blocked', options.is_blocked),
    ...booleanFilter('is_crawlable', options.is_crawlable),
    ...(walkTopics ? [] : topicFilters(options, effectiveTopicIds)),
    ...cursorFilter(options),
  ]
}

function booleanFilter(
  field: 'is_blocked' | 'is_crawlable',
  value: SearchUrlHostnamesOptions['is_blocked'],
): ReturnType<typeof sql>[] {
  if (value === true || value === 1 || value === '1') {
    return [field === 'is_blocked' ? sql`h.is_blocked` : sql`h.is_crawlable`]
  } else if (value === false || value === 0 || value === '0') {
    return [field === 'is_blocked' ? sql`(NOT h.is_blocked)` : sql`NOT h.is_crawlable`]
  }
  return []
}

function cursorFilter({ after, sort }: SearchUrlHostnamesOptions): ReturnType<typeof sql>[] {
  if (!after) return []
  if (sort === 'trust') {
    const cursor = decodeUuidCursor(
      after,
      isScoreCursor,
      'Invalid cursor format: expected score cursor',
    )
    return [sql`(h.votes_score_sort, h.id) < (${cursor.score}, ${cursor.id})`]
  }
  const cursor = decodeUuidCursor(
    after,
    isNameCursor,
    'Invalid cursor format: expected name cursor',
  )
  return [sql`(h.hostname, h.id) > (${cursor.name}, ${cursor.id})`]
}

function appendWhereClause(query: ReturnType<typeof sql>, filters: ReturnType<typeof sql>[]): void {
  if (filters.length === 0) return
  query.append(sql` WHERE `)
  filters.forEach((filter, index) => {
    if (index > 0) query.append(sql` AND `)
    query.append(filter)
  })
}
