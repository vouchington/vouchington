import { decodeUuidCursor, isNameCursor, isScoreCursor } from '@modules/pagination'
import { appendTopicDescendantsCte } from '@voucha/types/entities/topic-descendants'
import sql from 'sql-template-strings'
import type { SearchUrlHostnamesOptions } from './search.mts'

export function buildSearchUrlHostnamesQuery(options: SearchUrlHostnamesOptions) {
  const { limit, topic_id, topic_ids = [], include_descendants = false, sort } = options
  const effectiveLimit = limit || 50
  const effectiveTopicIds = Array.from(new Set(topic_id ? [topic_id] : topic_ids))
  const filters = buildSearchFilters(options, effectiveTopicIds)
  const searchQuery = sql`/* searchUrlHostnames */
    `

  if (effectiveTopicIds.length > 0 && include_descendants) {
    searchQuery.append(sql`WITH RECURSIVE `)
    appendTopicDescendantsCte(searchQuery, effectiveTopicIds, { trailingComma: false })
  }

  searchQuery.append(sql`
    SELECT view_url_hostnames.*
    FROM view_url_hostnames
  `)

  appendWhereClause(searchQuery, filters)
  searchQuery.append(sql` ORDER BY `)
  searchQuery.append(
    sort === 'trust' ? sql`votes_score_net DESC, id DESC` : sql`hostname ASC, id ASC`,
  )
  searchQuery.append(sql` LIMIT ${effectiveLimit + 1}`)

  return { effectiveLimit, searchQuery }
}

function buildSearchFilters(
  options: SearchUrlHostnamesOptions,
  effectiveTopicIds: string[],
): ReturnType<typeof sql>[] {
  const filters: ReturnType<typeof sql>[] = []
  appendTextFilter(filters, options)
  appendBooleanFilter(filters, 'blocked', options.blocked)
  appendBooleanFilter(filters, 'crawlable', options.crawlable)
  appendTopicFilters(filters, options, effectiveTopicIds)
  appendCursorFilter(filters, options)
  return filters
}

function appendTextFilter(
  filters: ReturnType<typeof sql>[],
  options: SearchUrlHostnamesOptions,
): void {
  const query = options.query || options.hostname
  if (typeof query === 'string' && query) {
    filters.push(sql`hostname ILIKE ${`%${query.toLowerCase()}%`}`)
  }
}

function appendBooleanFilter(
  filters: ReturnType<typeof sql>[],
  field: 'blocked' | 'crawlable',
  value: SearchUrlHostnamesOptions['blocked'],
): void {
  if (value === true || value === 1 || value === '1') {
    filters.push(field === 'blocked' ? sql`blocked = TRUE` : sql`crawlable = TRUE`)
  } else if (value === false || value === 0 || value === '0') {
    filters.push(field === 'blocked' ? sql`(blocked IS NOT TRUE)` : sql`crawlable = FALSE`)
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
      SELECT COUNT(DISTINCT topic_descendants.root_id)
      FROM topic_descendants
      WHERE topic_descendants.topic_id = view_url_hostnames.topic_id
    ) = ${effectiveTopicIds.length}`)
  } else {
    filters.push(sql`EXISTS (
      SELECT 1
      FROM topic_descendants
      WHERE topic_descendants.topic_id = view_url_hostnames.topic_id
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
      sql`(votes_score_net < ${cursor.score} OR (votes_score_net = ${cursor.score} AND id < ${cursor.id}))`,
    )
    return
  }
  const cursor = decodeUuidCursor(
    after,
    isNameCursor,
    'Invalid cursor format: expected name cursor',
  )
  filters.push(
    sql`(hostname > ${cursor.name} OR (hostname = ${cursor.name} AND id > ${cursor.id}))`,
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
