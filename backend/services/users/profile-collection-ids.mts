import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { searchRecentlyViewed } from '@services/recently-viewed'
import type { RelationTableName } from './profile-collection-tables.mts'

type RelationPageRow = {
  object_id: string
  created_us: number
  kept: boolean
}

type ChildPage = {
  kind: 'feeds' | 'items'
  filterValue?: string
  after?: { timestamp: number; id: string }
}

function relationPageBody(
  tableName: RelationTableName,
  relationWhere: string,
  child: { table: 'rss_feeds'; alias: 'rf' } | { table: 'rss_feed_items'; alias: 'rfi' },
  childWhere: string,
): string {
  return `
    WITH relation_page AS MATERIALIZED (
      SELECT rel.object_id, rel.created_at
      FROM ${tableName} rel
      WHERE ${relationWhere}
      ORDER BY rel.created_at DESC, rel.object_id DESC
      LIMIT $2
    )
    SELECT page.object_id,
           (EXTRACT(EPOCH FROM page.created_at) * 1000000)::bigint AS created_us,
           (${child.alias}.id IS NOT NULL) AS kept
    FROM relation_page page
    LEFT JOIN LATERAL (
      SELECT ${child.alias}.id
      FROM ${child.table} ${child.alias}
      WHERE ${child.alias}.id = page.object_id AND ${childWhere}
      LIMIT 1
    ) ${child.alias} ON TRUE
    ORDER BY page.created_at DESC, page.object_id DESC`
}

async function readLiveRelationPage(
  tableName: RelationTableName,
  userId: string,
  safeLimit: number,
  options: QueryOptions,
  child: ChildPage,
): Promise<RelationPageRow[]> {
  const params: unknown[] = [userId, safeLimit]
  const relationConditions = ['rel.subject_id = $1', 'rel.deleted_at IS NULL']
  const childAlias = child.kind === 'feeds' ? 'rf' : 'rfi'
  const childConditions = [`${childAlias}.deleted_at IS NULL`]
  let paramIdx = 2

  if (child.filterValue !== undefined) {
    paramIdx++
    params.push(child.filterValue)
    const column = child.kind === 'feeds' ? 'feed_type' : 'media_type'
    childConditions.push(`${childAlias}.${column} = $${paramIdx}`)
  }

  if (child.after) {
    const tsIdx = ++paramIdx
    params.push(child.after.timestamp)
    const idIdx = ++paramIdx
    params.push(child.after.id)
    relationConditions.push(
      `(rel.created_at, rel.object_id) < (TO_TIMESTAMP($${tsIdx}::numeric / 1000000), $${idIdx}::uuid)`,
    )
  }

  const relationWhere = relationConditions.join('\n        AND ')
  const childWhere = childConditions.join(' AND ')
  const body =
    child.kind === 'feeds'
      ? relationPageBody(tableName, relationWhere, { table: 'rss_feeds', alias: 'rf' }, childWhere)
      : relationPageBody(
          tableName,
          relationWhere,
          { table: 'rss_feed_items', alias: 'rfi' },
          childWhere,
        )
  const queryRows =
    child.kind === 'feeds'
      ? await read<{ object_id: string; created_us: string; kept: boolean }>(
          `/* getRssFeedRelationRows */${body}`,
          params,
          options,
        )
      : await read<{ object_id: string; created_us: string; kept: boolean }>(
          `/* getRssFeedItemRelationRows */${body}`,
          params,
          options,
        )
  const { rows } = queryRows

  return rows.map(row => ({
    object_id: row.object_id,
    created_us: Number(row.created_us),
    kept: row.kept,
  }))
}

export type RssFeedRelationRow = RelationPageRow

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
  return readLiveRelationPage(tableName, userId, safeLimit, options, {
    kind: 'feeds',
    filterValue: filters.feedType,
    after: filters.after,
  })
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
  const rows = await readLiveRelationPage(tableName, userId, safeLimit, options, {
    kind: 'items',
    filterValue: filters.mediaType,
    after: filters.after,
  })
  return rows.map(row => ({
    entity_id: row.object_id,
    created_us: row.created_us,
    kept: row.kept,
  }))
}

export function getRecentlyViewedRssFeedIds(userId: string, limit: number): Promise<string[]> {
  return searchRecentlyViewed('rss_feed', null, userId, limit)
}

export function compactResults<T>(items: Array<T | null | undefined>): T[] {
  return items.filter((item): item is T => item != null)
}
