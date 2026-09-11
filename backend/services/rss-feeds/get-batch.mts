import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import createError from 'http-errors'
import type { ViewRssFeed } from './types.mts'

export async function filterRssFeedIdsByFeedType(
  ids: string[],
  feedType: 'article' | 'podcast' | 'video' | 'mixed',
  options: QueryOptions = {},
): Promise<Set<string>> {
  if (ids.length === 0) return new Set()

  for (const id of ids) {
    if (!isUUID(id)) {
      throw createError(422, `Invalid RSS feed ID: ${id}`)
    }
  }

  const { rows } = await read<{ id: string }>(
    `/* filterRssFeedIdsByFeedType */
    SELECT id
    FROM rss_feeds
    WHERE id = ANY($1::uuid[])
      AND deleted_at IS NULL
      AND feed_type = $2`,
    [ids, feedType],
    options,
  )
  return new Set(rows.map(row => row.id))
}

export const getRssFeedsByIdBatch = async (
  ids: string[],
  options: QueryOptions = {},
): Promise<Array<ViewRssFeed | null | undefined>> => {
  if (ids.length === 0) {
    return []
  }

  // Validate all inputs are UUIDs
  for (const id of ids) {
    if (!isUUID(id)) {
      throw createError(422, `Invalid RSS feed ID: ${id}`)
    }
  }

  const positions = ids.map((_, index) => index)

  const { rows } = await read(
    `/* getRssFeedsByIdBatch */
    WITH input_data AS (
      SELECT unnest($1::uuid[]) AS input_value,
             unnest($2::int[]) AS input_order
    )
    SELECT vrf.*, input_data.input_order
    FROM view_rss_feeds vrf
    JOIN input_data ON vrf.id = input_data.input_value
    ORDER BY input_data.input_order
  `,
    [ids, positions],
    options,
  )

  // Build result array with nulls for missing entries
  const results: Array<ViewRssFeed | null | undefined> = new Array(ids.length).fill(null)

  for (const row of rows) {
    const { input_order, ...feedData } = row
    results[input_order] = feedData as ViewRssFeed
  }

  return results
}
