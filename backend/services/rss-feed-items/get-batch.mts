import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import createError from 'http-errors'
import type { ViewRssFeedItem } from './types.mts'

export async function filterRssFeedItemIdsByMediaType(
  ids: string[],
  mediaType: 'article' | 'audio' | 'video',
  options: QueryOptions = {},
): Promise<Set<string>> {
  if (ids.length === 0) return new Set()

  for (const id of ids) {
    if (!isUUID(id)) {
      throw createError(422, `Invalid RSS feed item ID: ${id}`)
    }
  }

  const { rows } = await read<{ id: string }>(
    `/* filterRssFeedItemIdsByMediaType */
    SELECT id
    FROM rss_feed_items
    WHERE id = ANY($1::uuid[])
      AND deleted_at IS NULL
      AND media_type = $2`,
    [ids, mediaType],
    options,
  )
  return new Set(rows.map(row => row.id))
}

export const getRssFeedItemsByIdBatch = async (
  ids: string[],
  options: QueryOptions = {},
): Promise<Array<ViewRssFeedItem | null | undefined>> => {
  if (ids.length === 0) {
    return []
  }

  for (const id of ids) {
    if (!isUUID(id)) {
      throw createError(422, `Invalid RSS feed item ID: ${id}`)
    }
  }

  const { rows } = await read(
    `/* getRssFeedItemsByIdBatch */
    SELECT vrfi.*
    FROM view_rss_feed_items vrfi
    WHERE vrfi.id = ANY($1::uuid[])
  `,
    [ids],
    options,
  )

  // Build a map of id -> row for O(1) lookups
  const rowMap = new Map<string, ViewRssFeedItem>()
  for (const row of rows) {
    rowMap.set(row.id, row as ViewRssFeedItem)
  }

  // Return results in input order with nulls for missing entries
  return ids.map(id => rowMap.get(id) ?? null)
}
