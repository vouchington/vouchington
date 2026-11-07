import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { searchRecentlyViewed } from '@services/recently-viewed'
import type { RelationTableName } from './profile-collection-tables.mts'

type RelationRow = {
  object_id: string
  created_us: number
}

type ChildPage = {
  kind: 'feeds' | 'items'
  filterValue?: string
  after?: { timestamp: number; id: string }
}

async function readRelationPage(
  queryName: 'getRssFeedRelationRows' | 'getRssFeedItemRelationRows',
  tableName: RelationTableName,
  userId: string,
  safeLimit: number,
  options: QueryOptions,
  child: ChildPage,
): Promise<RelationRow[]> {
  const params: unknown[] = [userId, safeLimit]
  const conditions = ['rel.subject_id = $1', 'rel.deleted_at IS NULL']
  const childAlias = child.kind === 'feeds' ? 'rf' : 'rfi'
  conditions.push(`${childAlias}.deleted_at IS NULL`)
  if (child.kind === 'feeds') {
    conditions.push(`EXISTS (
      SELECT 1
      FROM topics eligible_topic
      WHERE eligible_topic.id = rf.topic_id
        AND eligible_topic.deleted_at IS NULL
        AND eligible_topic.merged_into_topic_id IS NULL
    )`)
  } else {
    // Mirror item hydration's chosen-source semantics: an item is visible only when its
    // ranked primary source can itself be joined through view_rss_feeds.
    conditions.push(`EXISTS (
      SELECT 1
      FROM view_rss_feed_items eligible_item
      WHERE eligible_item.id = rfi.id
    )`)
  }
  let paramIdx = 2

  if (child.filterValue !== undefined) {
    paramIdx++
    params.push(child.filterValue)
    const column = child.kind === 'feeds' ? 'feed_type' : 'media_type'
    conditions.push(`${childAlias}.${column} = $${paramIdx}`)
  }

  if (child.after) {
    const tsIdx = ++paramIdx
    params.push(child.after.timestamp)
    const idIdx = ++paramIdx
    params.push(child.after.id)
    conditions.push(
      `(rel.created_at, rel.object_id) < (TO_TIMESTAMP($${tsIdx}::numeric / 1000000), $${idIdx}::uuid)`,
    )
  }

  const { rows } = await read<{ object_id: string; created_us: string }>(
    `/* ${queryName} */
    SELECT rel.object_id,
           (EXTRACT(EPOCH FROM rel.created_at) * 1000000)::bigint AS created_us
    FROM ${tableName} rel
    JOIN ${child.kind === 'feeds' ? 'rss_feeds' : 'rss_feed_items'} ${childAlias}
      ON ${childAlias}.id = rel.object_id
    WHERE ${conditions.join('\n      AND ')}
    ORDER BY rel.created_at DESC, rel.object_id DESC
    LIMIT $2`,
    params,
    options,
  )

  return rows.map(row => ({ object_id: row.object_id, created_us: Number(row.created_us) }))
}

export type RssFeedRelationRow = RelationRow

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
  return readRelationPage('getRssFeedRelationRows', tableName, userId, safeLimit, options, {
    kind: 'feeds',
    filterValue: filters.feedType,
    after: filters.after,
  })
}

export type RssFeedItemRelationRow = { entity_id: string; created_us: number }

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
  const rows = await readRelationPage(
    'getRssFeedItemRelationRows',
    tableName,
    userId,
    safeLimit,
    options,
    {
      kind: 'items',
      filterValue: filters.mediaType,
      after: filters.after,
    },
  )
  return rows.map(row => ({
    entity_id: row.object_id,
    created_us: row.created_us,
  }))
}

export function getRecentlyViewedRssFeedIds(userId: string, limit: number): Promise<string[]> {
  return searchRecentlyViewed('rss_feed', null, userId, limit)
}

export function compactResults<T>(items: Array<T | null | undefined>): T[] {
  return items.filter((item): item is T => item != null)
}
