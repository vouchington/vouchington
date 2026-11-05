import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { searchRecentlyViewed } from '@services/recently-viewed'
import type { RelationTableName } from './profile-collection-tables.mts'

export type RssFeedRelationRow = {
  object_id: string
  created_us: number
  kept: boolean
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
  const feedConditions = ['rf.deleted_at IS NULL']
  let paramIdx = 2

  if (filters.feedType) {
    paramIdx++
    params.push(filters.feedType)
    feedConditions.push(`rf.feed_type = $${paramIdx}`)
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

  const { rows } = await read<{ object_id: string; created_us: string; kept: boolean }>(
    `/* getRssFeedRelationRows */
    WITH relation_page AS MATERIALIZED (
      SELECT rel.object_id, rel.created_at
      FROM ${tableName} rel
      WHERE ${conditions.join('\n        AND ')}
      ORDER BY rel.created_at DESC, rel.object_id DESC
      LIMIT $2
    )
    SELECT page.object_id,
           (EXTRACT(EPOCH FROM page.created_at) * 1000000)::bigint AS created_us,
           (rf.id IS NOT NULL) AS kept
    FROM relation_page page
    LEFT JOIN LATERAL (
      SELECT rf.id
      FROM rss_feeds rf
      WHERE rf.id = page.object_id AND ${feedConditions.join(' AND ')}
      LIMIT 1
    ) rf ON TRUE
    ORDER BY page.created_at DESC, page.object_id DESC`,
    params,
    options,
  )

  return rows.map(row => ({
    object_id: row.object_id,
    created_us: Number(row.created_us),
    kept: row.kept,
  }))
}

export type RssFeedItemRelationRow = {
  entity_id: string
  created_us: number
  kept: boolean
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
  const itemConditions = ['rfi.deleted_at IS NULL']
  let paramIdx = 2

  if (filters.mediaType) {
    paramIdx++
    params.push(filters.mediaType)
    itemConditions.push(`rfi.media_type = $${paramIdx}`)
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

  const { rows } = await read<{ entity_id: string; created_us: string; kept: boolean }>(
    `/* getRssFeedItemRelationRows */
    WITH relation_page AS MATERIALIZED (
      SELECT rel.object_id, rel.created_at
      FROM ${tableName} rel
      WHERE ${conditions.join('\n        AND ')}
      ORDER BY rel.created_at DESC, rel.object_id DESC
      LIMIT $2
    )
    SELECT page.object_id AS entity_id,
           (EXTRACT(EPOCH FROM page.created_at) * 1000000)::bigint AS created_us,
           (rfi.id IS NOT NULL) AS kept
    FROM relation_page page
    LEFT JOIN LATERAL (
      SELECT rfi.id
      FROM rss_feed_items rfi
      WHERE rfi.id = page.object_id AND ${itemConditions.join(' AND ')}
      LIMIT 1
    ) rfi ON TRUE
    ORDER BY page.created_at DESC, page.object_id DESC`,
    params,
    options,
  )

  return rows.map(row => ({
    entity_id: row.entity_id,
    created_us: Number(row.created_us),
    kept: row.kept,
  }))
}

export function getRecentlyViewedRssFeedIds(userId: string, limit: number): Promise<string[]> {
  return searchRecentlyViewed('rss_feed', null, userId, limit)
}

export function compactResults<T>(items: Array<T | null | undefined>): T[] {
  return items.filter((item): item is T => item != null)
}
