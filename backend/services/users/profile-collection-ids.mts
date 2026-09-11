import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { searchRecentlyViewed } from '@services/recently-viewed'
import type { RelationTableName } from './profile-collection-tables.mts'

export type RssFeedRelationRow = {
  object_id: string
  created_us: number
}

export async function getRssFeedRelationRows(
  tableName: RelationTableName,
  userId: string,
  safeLimit: number,
  options: QueryOptions,
  filters: {
    feedType?: 'article' | 'podcast' | 'video' | 'mixed'
    after?: { timestamp: number; id: string }
  } = {},
): Promise<RssFeedRelationRow[]> {
  const params: unknown[] = [userId, safeLimit]
  const conditions: string[] = ['rel.subject_id = $1', 'rel.deleted_at IS NULL']
  let paramIdx = 2

  if (filters.feedType) {
    paramIdx++
    params.push(filters.feedType)
    conditions.push(`rf.feed_type = $${paramIdx}`)
  }

  if (filters.after) {
    const tsIdx = ++paramIdx
    params.push(filters.after.timestamp)
    const idIdx = ++paramIdx
    params.push(filters.after.id)
    conditions.push(
      `(rel.created_at, rel.object_id) < (TO_TIMESTAMP($${tsIdx}::numeric / 1000000), $${idIdx}::uuid)`,
    )
  }

  const whereClause = conditions.join('\n      AND ')

  const { rows } = await read<{ object_id: string; created_us: string }>(
    `/* getRssFeedRelationRows */
    SELECT rel.object_id,
           (EXTRACT(EPOCH FROM rel.created_at) * 1000000)::bigint AS created_us
    FROM ${tableName} rel
    JOIN rss_feeds rf ON rf.id = rel.object_id AND rf.deleted_at IS NULL
    WHERE ${whereClause}
    ORDER BY rel.created_at DESC, rel.object_id DESC
    LIMIT $2`,
    params,
    options,
  )

  return rows.map(row => ({
    object_id: row.object_id,
    created_us: Number(row.created_us),
  }))
}

export type RssFeedItemRelationRow = {
  entity_id: string
  created_us: number
}

export async function getRssFeedItemRelationRows(
  tableName: RelationTableName,
  userId: string,
  safeLimit: number,
  options: QueryOptions,
  filters: {
    mediaType?: 'article' | 'audio' | 'video'
    after?: { timestamp: number; id: string }
  } = {},
): Promise<RssFeedItemRelationRow[]> {
  const params: unknown[] = [userId, safeLimit]
  const conditions: string[] = ['rel.subject_id = $1', 'rel.deleted_at IS NULL']
  let paramIdx = 2

  if (filters.mediaType) {
    paramIdx++
    params.push(filters.mediaType)
    conditions.push(`rfi.media_type = $${paramIdx}`)
  }

  if (filters.after) {
    const tsIdx = ++paramIdx
    params.push(filters.after.timestamp)
    const idIdx = ++paramIdx
    params.push(filters.after.id)
    conditions.push(
      `(rel.created_at, rel.object_id) < (TO_TIMESTAMP($${tsIdx}::numeric / 1000000), $${idIdx}::uuid)`,
    )
  }

  const whereClause = conditions.join('\n      AND ')

  const { rows } = await read<{ entity_id: string; created_us: string }>(
    `/* getRssFeedItemRelationRows */
    SELECT rel.object_id AS entity_id,
           (EXTRACT(EPOCH FROM rel.created_at) * 1000000)::bigint AS created_us
    FROM ${tableName} rel
    JOIN rss_feed_items rfi ON rfi.id = rel.object_id AND rfi.deleted_at IS NULL
    WHERE ${whereClause}
    ORDER BY rel.created_at DESC, rel.object_id DESC
    LIMIT $2`,
    params,
    options,
  )

  return rows.map(row => ({
    entity_id: row.entity_id,
    created_us: Number(row.created_us),
  }))
}

export function getRecentlyViewedRssFeedIds(userId: string, limit: number): Promise<string[]> {
  return searchRecentlyViewed('rss_feed', null, userId, limit)
}

export function compactResults<T>(items: Array<T | null | undefined>): T[] {
  return items.filter((item): item is T => item != null)
}
