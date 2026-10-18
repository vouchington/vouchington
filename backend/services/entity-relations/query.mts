import sql from 'sql-template-strings'
import { read, write } from '@data-stores/psql'
import type { EntityRelationEntityType, EntityRelationPredicateType } from './config.mts'
import { entityRelationMetadatum } from './metadata.mts'
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
  /** Whose access rules filter posts and mask anonymous authors. */
  viewer: EntityRelationViewer
  minNetVoteScore?: number
  positiveNetVoteScore?: boolean
  limit?: number
  sort?: 'best' | 'newest'
  readOnly?: boolean
  after?: EntityRelationPageCursor
  /** Restricts results to these objects, e.g. to read back a just-written relation. */
  objectIds?: readonly string[]
}

export type EntityRelationResult = {
  id?: string
  subject_id?: string
  object_id?: string
  created_at: Date
  cursor_created_at: string
  /** Null when the creator is the anonymous author of the subject or object post. */
  created_by_id: string | null
  deleted_at?: Date
  deleted_by_id?: string
  order_index?: number
  votes_count_up?: number
  votes_count_down?: number
  votes_score_net?: number
  votes_score_sort?: number
  /** The object's public fields; see `entityRelationObjectColumns`. */
  object_data: Record<string, unknown>
}

export type PublicEntityRelationResult = Omit<EntityRelationResult, 'cursor_created_at'>

type LatestCrawl = { title?: string | null; image_url?: string | null } | null

export async function getEntityRelations(
  subjectType: EntityRelationEntityType,
  subjectId: string,
  predicate: EntityRelationPredicateType,
  objectType: EntityRelationEntityType,
  options: EntityRelationQueryOptions,
): Promise<EntityRelationResult[]> {
  const { limit = 100, sort = 'best', readOnly, ...selectOptions } = options
  const metadata = entityRelationMetadatum.find(
    m =>
      m.subject_type === subjectType && m.object_type === objectType && m.predicate === predicate,
  )
  if (!metadata) {
    throw new Error(`No entity relation found for ${subjectType} -> ${predicate} -> ${objectType}`)
  }

  const query = buildEntityRelationSelectQuery(metadata, subjectId, {
    ...selectOptions,
    limit,
    sort,
  })
  const { rows } = await (readOnly === false ? write : read)(query)
  const relations = rows as EntityRelationResult[]
  return decorateRelations(metadata.object_type, relations)
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

/** One bounded page per subject, preserving each subject's own ordering and limit. */
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
  const metadata = entityRelationMetadatum.find(
    row =>
      row.subject_type === subjectType &&
      row.predicate === predicate &&
      row.object_type === objectType,
  )
  if (!metadata)
    throw new Error(`No entity relation found for ${subjectType} -> ${predicate} -> ${objectType}`)
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
  for (const row of rows) {
    const { requested_subject_id, ...relation } = row
    grouped.get(requested_subject_id as string)!.push(relation as EntityRelationResult)
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
): Promise<{ results: EntityRelationResult[]; hasNextPage: boolean }> {
  const limit = options.limit ?? 100
  const rows = await getEntityRelations(subjectType, subjectId, predicate, objectType, {
    ...options,
    limit: limit + 1,
  })
  return { results: rows.slice(0, limit), hasNextPage: rows.length > limit }
}
