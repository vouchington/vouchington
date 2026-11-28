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

  const uniqueIds = [...new Set(ids)]

  const { rows } = await read<ViewRssFeed>(
    `/* getRssFeedsByIdBatch */
    SELECT vrf.*
    FROM unnest($1::uuid[]) AS requested(id)
    JOIN LATERAL (
      SELECT vrf.*
      FROM view_rss_feeds vrf
      WHERE vrf.id = requested.id
      LIMIT 1
    ) vrf ON true
  `,
    [uniqueIds],
    options,
  )

  const rowMap = new Map<string, ViewRssFeed>()
  for (const row of rows) {
    rowMap.set(row.id, row)
  }

  return ids.map(id => rowMap.get(id) ?? null)
}
