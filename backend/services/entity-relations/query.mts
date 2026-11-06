import sql from 'sql-template-strings'
import { read, write } from '@data-stores/psql'
import type { EntityRelationEntityType, EntityRelationPredicateType } from './config.mts'
import { entityRelationMetadatum, type EntityRelationMetadata } from './metadata.mts'
import { parseSigningKeys } from '@vouchington/utils/url-signing'
import { buildSideloadImageUrl, SIDELOAD_SIGNING_KEYS_ENV } from '@ts-shared/url-signing'
import { getImageOrigin } from '@modules/utils/image-origin'
import {
  buildEntityRelationSelectQuery,
  type EntityRelationPageCursor,
} from './build-select-query.mts'
import type { EntityRelationViewer } from './viewer.mts'

export type { EntityRelationPageCursor } from './build-select-query.mts'

export type EntityRelationQueryOptions = {
  viewer: EntityRelationViewer
  minNetVoteScore?: number
  positiveNetVoteScore?: boolean
  limit?: number
  sort?: 'best' | 'newest'
  readOnly?: boolean
  after?: EntityRelationPageCursor
  objectIds?: readonly string[]
}

export type EntityRelationResult = {
  id?: string
  subject_id?: string
  object_id?: string
  created_at: Date
  cursor_created_at: string
  created_by_id: string | null
  deleted_at?: Date
  deleted_by_id?: string
  order_index?: number
  votes_count_up?: number
  votes_count_down?: number
  votes_score_net?: number
  votes_score_sort?: number
  object_data: Record<string, unknown>
}

export type PublicEntityRelationResult = Omit<EntityRelationResult, 'cursor_created_at'>

type EntityRelationRow = EntityRelationResult & { eligible: boolean }

type LatestCrawl = { title?: string | null; image_url?: string | null } | null

export async function getEntityRelations(
  subjectType: EntityRelationEntityType,
  subjectId: string,
  predicate: EntityRelationPredicateType,
  objectType: EntityRelationEntityType,
  options: EntityRelationQueryOptions,
): Promise<EntityRelationResult[]> {
  const { limit = 100, sort = 'best', readOnly, ...selectOptions } = options
  const metadata = requireRelationMetadata(subjectType, predicate, objectType)
  const rows = await loadEntityRelationRows(metadata, subjectId, {
    ...selectOptions,
    limit,
    sort,
    readOnly,
  })
  return decorateRelations(metadata.object_type, visibleRelations(rows))
}

function requireRelationMetadata(
  subjectType: EntityRelationEntityType,
  predicate: EntityRelationPredicateType,
  objectType: EntityRelationEntityType,
): EntityRelationMetadata {
  const metadata = entityRelationMetadatum.find(
    row =>
      row.subject_type === subjectType &&
      row.predicate === predicate &&
      row.object_type === objectType,
  )
  if (!metadata) {
    throw new Error(`No entity relation found for ${subjectType} -> ${predicate} -> ${objectType}`)
  }
  return metadata
}

function visibleRelations(rows: readonly EntityRelationRow[]): EntityRelationResult[] {
  const visible: EntityRelationResult[] = []
  for (const row of rows) if (row.eligible) visible.push(withoutEligible(row))
  return visible
}

async function loadEntityRelationRows(
  metadata: EntityRelationMetadata,
  subjectId: string,
  options: EntityRelationQueryOptions & { limit: number; sort: 'best' | 'newest' },
): Promise<EntityRelationRow[]> {
  const { readOnly, limit, sort, ...selectOptions } = options
  const query = buildEntityRelationSelectQuery(metadata, subjectId, {
    ...selectOptions,
    limit,
    sort,
  })
  const { rows } = await (readOnly === false ? write : read)(query)
  return rows as EntityRelationRow[]
}

function withoutEligible(row: EntityRelationRow): EntityRelationResult {
  const { eligible: _eligible, ...relation } = row
  return relation
}

function decorateRelations(
  objectType: EntityRelationEntityType,
  relations: EntityRelationResult[],
): EntityRelationResult[] {
  if (objectType !== 'url') return relations
  const signingKeys = parseSigningKeys(process.env[SIDELOAD_SIGNING_KEYS_ENV])
  return relations.map(row => {
    const crawl = (row.object_data as { latest_crawl?: LatestCrawl }).latest_crawl
    if (!crawl?.image_url) return row
    const proxied = buildSideloadImageUrl(crawl.image_url, {
      imageOrigin: getImageOrigin(),
      width: 64,
      signingKeys,
    })
    return {
      ...row,
      object_data: { ...row.object_data, latest_crawl: { ...crawl, image_url: proxied ?? null } },
    }
  })
}

export async function getEntityRelationsBatch(
  subjectType: EntityRelationEntityType,
  subjectIds: string[],
  predicate: EntityRelationPredicateType,
  objectType: EntityRelationEntityType,
  options: EntityRelationQueryOptions,
): Promise<Map<string, EntityRelationResult[]>> {
  const uniqueIds = [...new Set(subjectIds)]
  const grouped = new Map(uniqueIds.map(id => [id, [] as EntityRelationResult[]]))
  if (uniqueIds.length === 0) return grouped
  const metadata = requireRelationMetadata(subjectType, predicate, objectType)
  const query = sql`/* getEntityRelationsBatch */ `
  uniqueIds.forEach((id, index) => {
    if (index) query.append(' UNION ALL ')
    query
      .append(sql`SELECT ${id}::text AS requested_subject_id, page.* FROM (`)
      .append(
        buildEntityRelationSelectQuery(metadata, id, {
          ...options,
          limit: options.limit ?? 100,
          sort: options.sort ?? 'best',
        }),
      )
      .append(') page')
  })
  query.append(' ORDER BY requested_subject_id, ')
  if ((options.sort ?? 'best') === 'best' && metadata.election)
    query.append('votes_score_sort DESC, created_at DESC, object_id DESC')
  else if (options.sort === 'newest' || !metadata.order_index)
    query.append('created_at DESC, object_id DESC')
  else query.append('order_index ASC, object_id ASC')
  const { rows } = await (options.readOnly === false ? write : read)(query)
  for (const row of rows as Array<EntityRelationRow & { requested_subject_id: string }>) {
    if (!row.eligible) continue
    const { requested_subject_id, eligible: _eligible, ...relation } = row
    grouped.get(requested_subject_id)!.push(relation)
  }
  return new Map(
    [...grouped].map(([id, relations]) => [id, decorateRelations(objectType, relations)]),
  )
}

export async function getEntityRelationsPage(
  subjectType: EntityRelationEntityType,
  subjectId: string,
  predicate: EntityRelationPredicateType,
  objectType: EntityRelationEntityType,
  options: EntityRelationQueryOptions,
): Promise<{
  results: EntityRelationResult[]
  hasNextPage: boolean
  continuation: EntityRelationResult | null
}> {
  const limit = options.limit ?? 100
  const metadata = requireRelationMetadata(subjectType, predicate, objectType)
  const rows = await loadEntityRelationRows(metadata, subjectId, {
    ...options,
    limit: limit + 1,
    sort: options.sort ?? 'best',
  })
  const window = rows.slice(0, limit)
  const hasMore = rows.length > limit
  const last = window.at(-1)
  return {
    results: decorateRelations(metadata.object_type, visibleRelations(window)),
    hasNextPage: hasMore,
    continuation: hasMore && last ? withoutEligible(last) : null,
  }
}
