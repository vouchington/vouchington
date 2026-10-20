import { decodeUuidCursor, isNameCursor, isScoreCursor } from '@modules/pagination'
import { escapeLikePattern } from '@modules/search-utils'
import { appendTopicDescendantsCte } from '@voucha/types/entities/topic-descendants'
import sql from 'sql-template-strings'
import type { SearchUrlHostnamesOptions } from './search-types.mts'

export function buildSearchUrlHostnamesQuery(options: SearchUrlHostnamesOptions) {
  const { limit, topic_id, topic_ids = [], include_descendants = false, sort } = options
  const effectiveLimit = limit || 50
  const effectiveTopicIds = Array.from(new Set(topic_id ? [topic_id] : topic_ids))
  const filters = buildSearchFilters(options, effectiveTopicIds)
  const searchQuery = sql`/* searchUrlHostnames */
    `

  if (effectiveTopicIds.length > 0 && include_descendants) {
    searchQuery.append(sql`WITH RECURSIVE `)
    appendTopicDescendantsCte(searchQuery, effectiveTopicIds)
  } else {
    searchQuery.append(sql`WITH `)
  }

  const textQuery = options.query || options.hostname
  if (typeof textQuery === 'string' && textQuery) {
    searchQuery.append(sql`text_match_ids AS MATERIALIZED (
      SELECT id FROM url_hostnames
      WHERE hostname ILIKE ${`%${escapeLikePattern(textQuery.toLowerCase())}%`} ESCAPE '\\'
    ), `)
  }

  searchQuery.append(sql`
    candidate_hostnames AS MATERIALIZED (
    SELECT h.id, h.hostname, h.votes_score_net
  `)
  if (typeof textQuery === 'string' && textQuery) {
    searchQuery.append(sql`FROM text_match_ids text_match
      JOIN LATERAL (
        SELECT * FROM url_hostnames WHERE id = text_match.id LIMIT 1
      ) h ON true`)
  } else {
    searchQuery.append(sql`FROM url_hostnames h`)
  }

  appendWhereClause(searchQuery, filters)
  searchQuery.append(sql` ORDER BY `)
  searchQuery.append(
    sort === 'trust' ? sql`h.votes_score_net DESC, h.id DESC` : sql`h.hostname ASC, h.id ASC`,
  )
  searchQuery.append(sql` LIMIT ${effectiveLimit + 1}`)
  searchQuery.append(sql`
    )
    SELECT hydrated.*
    FROM candidate_hostnames candidate
    JOIN LATERAL (
      SELECT * FROM view_url_hostnames WHERE id = candidate.id LIMIT 1
    ) hydrated ON true
    ORDER BY `)
  searchQuery.append(
    sort === 'trust'
      ? sql`candidate.votes_score_net DESC, candidate.id DESC`
      : sql`candidate.hostname ASC, candidate.id ASC`,
  )

  return { effectiveLimit, searchQuery }
}

function buildSearchFilters(
  options: SearchUrlHostnamesOptions,
  effectiveTopicIds: string[],
): ReturnType<typeof sql>[] {
  const filters: ReturnType<typeof sql>[] = []
  if (!options.includePrivate) filters.push(sql`publicly_introduced_at IS NOT NULL`)
  appendBooleanFilter(filters, 'is_blocked', options.is_blocked)
  appendBooleanFilter(filters, 'is_crawlable', options.is_crawlable)
  appendTopicFilters(filters, options, effectiveTopicIds)
  appendCursorFilter(filters, options)
  return filters
}

function appendBooleanFilter(
  filters: ReturnType<typeof sql>[],
  field: 'is_blocked' | 'is_crawlable',
  value: SearchUrlHostnamesOptions['is_blocked'],
): void {
  if (value === true || value === 1 || value === '1') {
    filters.push(field === 'is_blocked' ? sql`is_blocked` : sql`is_crawlable`)
  } else if (value === false || value === 0 || value === '0') {
    filters.push(field === 'is_blocked' ? sql`(NOT is_blocked)` : sql`NOT is_crawlable`)
  }
}

function appendTopicFilters(
  filters: ReturnType<typeof sql>[],
  { include_descendants = false, topic_match = 'any' }: SearchUrlHostnamesOptions,
  effectiveTopicIds: string[],
): void {
  if (effectiveTopicIds.length === 0) return
  if (!include_descendants) {
    appendDirectTopicFilter(filters, topic_match, effectiveTopicIds)
    return
  }
  if (topic_match === 'all' && effectiveTopicIds.length > 1) {
    filters.push(sql`(
      SELECT COUNT(DISTINCT topic_descendants.root_post_id)
      FROM topic_descendants
      WHERE topic_descendants.topic_id = h.topic_id
    ) = ${effectiveTopicIds.length}`)
  } else {
    filters.push(sql`EXISTS (
      SELECT 1
      FROM topic_descendants
      WHERE topic_descendants.topic_id = h.topic_id
    )`)
  }
}

function appendDirectTopicFilter(
  filters: ReturnType<typeof sql>[],
  topicMatch: SearchUrlHostnamesOptions['topic_match'],
  effectiveTopicIds: string[],
): void {
  if (effectiveTopicIds.length === 1) {
    filters.push(sql`topic_id = ${effectiveTopicIds[0]}`)
  } else if (topicMatch === 'all') {
    filters.push(sql`FALSE`)
  } else {
    filters.push(sql`topic_id = ANY(${effectiveTopicIds})`)
  }
}

function appendCursorFilter(
  filters: ReturnType<typeof sql>[],
  { after, sort }: SearchUrlHostnamesOptions,
): void {
  if (!after) return
  if (sort === 'trust') {
    const cursor = decodeUuidCursor(
      after,
      isScoreCursor,
      'Invalid cursor format: expected score cursor',
    )
    filters.push(
      sql`(h.votes_score_net < ${cursor.score} OR (h.votes_score_net = ${cursor.score} AND h.id < ${cursor.id}))`,
    )
    return
  }
  const cursor = decodeUuidCursor(
    after,
    isNameCursor,
    'Invalid cursor format: expected name cursor',
  )
  filters.push(
    sql`(h.hostname > ${cursor.name} OR (h.hostname = ${cursor.name} AND h.id > ${cursor.id}))`,
  )
}

function appendWhereClause(query: ReturnType<typeof sql>, filters: ReturnType<typeof sql>[]): void {
  if (filters.length === 0) return
  query.append(sql` WHERE `)
  filters.forEach((filter, index) => {
    if (index > 0) query.append(sql` AND `)
    query.append(filter)
  })
}
