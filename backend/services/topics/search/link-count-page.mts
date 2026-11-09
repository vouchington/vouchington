import createHttpError from 'http-errors'
import { read } from '@data-stores/psql'
import { decodeUuidCursor, isScoreCursor } from '@modules/pagination'
import { clampLimit } from '@services/pagination'
import sql from 'sql-template-strings'
import type { TopicSearchOptions } from './types.mts'

export type ActiveLinkCountTopicRow = {
  id: string
  name: string
  slug: string
  topic_type: string
  active_link_count: number
}

type ActiveLinkCountPage = {
  rows: ActiveLinkCountTopicRow[]
  hasNextPage: boolean
}

// sort=link_count is the enabled-program keyset. Text, semantic, and other topic filters
// would drop rows after LIMIT and leave a short page.
export function assertActiveLinkCountSortStandsAlone(options: TopicSearchOptions): void {
  if (options.omitLimit) {
    throw createHttpError(400, 'sort=link_count requires a page limit')
  }
  const hasFilter =
    !!options.text_search_query?.trim() ||
    !!options.semantic_search_query?.trim() ||
    !!options.similar_post_id ||
    !!options.similar_topic_id ||
    !!options.similar_rss_feed_item_id ||
    (options.slugs?.length ?? 0) > 0 ||
    (options.topic_types?.length ?? 0) > 0 ||
    (options.hashtag_topic_ids?.length ?? 0) > 0 ||
    options.spending_category !== undefined ||
    options.rss_feed !== undefined ||
    options.fediverse_instance !== undefined ||
    !!options.fediverse_instance_software ||
    options.fediverse_instance_open_registrations !== undefined ||
    options.fediverse_instance_integration_status !== undefined
  if (hasFilter) {
    throw createHttpError(400, 'sort=link_count does not combine with topic search filters')
  }
}

function decodeActiveLinkCountCursor(after: string | undefined): {
  count: number | null
  id: string | null
} {
  if (!after) return { count: null, id: null }
  const cursor = decodeUuidCursor(after, isScoreCursor, 'Invalid cursor for sort=link_count')
  if (!Number.isSafeInteger(cursor.score) || cursor.score < 0) {
    throw createHttpError(400, 'Invalid cursor for sort=link_count')
  }
  return { count: cursor.score, id: cursor.id }
}

// Counts reflect the latest refresh; current program and topic eligibility is checked live.
// Stale ineligible rows may require scanning more than a page of the ranking index.
export async function readActiveLinkCountTopicPage(options: {
  limit?: number
  after?: string
}): Promise<ActiveLinkCountPage> {
  const limit = clampLimit(options.limit)
  const cursor = decodeActiveLinkCountCursor(options.after)
  const query = sql`/* readActiveLinkCountTopicPage */
    SELECT
      t.id,
      t.name,
      t.slug,
      t.topic_type,
      rp.active_link_count
    FROM mv_referral_program_link_counts rp
    INNER JOIN referral_program_topics program ON program.topic_id = rp.topic_id
      AND program.enabled_at IS NOT NULL AND program.disabled_at IS NULL
    INNER JOIN topics t ON t.id = rp.topic_id
      AND t.deleted_at IS NULL
      AND t.merged_into_topic_id IS NULL
    WHERE rp.active_link_count > 0`

  if (cursor.count !== null && cursor.id !== null) {
    query.append(sql`
      AND (rp.active_link_count, rp.topic_id) < (${cursor.count}::bigint, ${cursor.id}::uuid)`)
  }

  query.append(sql`
    ORDER BY rp.active_link_count DESC, rp.topic_id DESC
    LIMIT ${limit + 1}
  `)

  const { rows } = await read<{
    id: string
    name: string
    slug: string
    topic_type: string
    active_link_count: number | string
  }>(query)
  const hasNextPage = rows.length > limit
  return {
    hasNextPage,
    rows: rows.slice(0, limit).map(row => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      topic_type: row.topic_type,
      active_link_count: Number(row.active_link_count),
    })),
  }
}
