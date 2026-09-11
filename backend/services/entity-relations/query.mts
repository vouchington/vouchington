/* eslint-disable max-lines */
import { read, write } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { EntityRelationEntityType, EntityRelationPredicateType } from './config.mts'
import { entityRelationEntityTables, entityRelationMetadatum } from './metadata.mts'
import {
  buildSideloadImageUrl,
  parseSigningKeys,
  SIDELOAD_SIGNING_KEYS_ENV,
} from '@ts-shared/url-signing'
import { getImageOrigin } from '@modules/utils/image-origin'
import { buildVoteScoreFilters } from './vote-score-filters.mts'

export type EntityRelationQueryOptions = {
  minNetVoteScore?: number
  positiveNetVoteScore?: boolean
  limit?: number
  sort?: 'best' | 'newest'
  readOnly?: boolean
  after?: EntityRelationPageCursor
}

export type EntityRelationPageCursor = {
  id: string
  createdAt?: string
  votesScoreSort?: number
  orderIndex?: number
}

export type EntityRelationResult = {
  id?: string
  subject_id?: string
  object_id?: string
  created_at: Date
  cursor_created_at: string
  created_by_id: string
  deleted_at?: Date
  deleted_by_id?: string
  order_index?: number
  votes_count_up?: number
  votes_count_down?: number
  votes_score_net?: number
  votes_score_sort?: number
  // Object entity data (varies by type)
  object_data: Record<string, unknown>
}

export type PublicEntityRelationResult = Omit<EntityRelationResult, 'cursor_created_at'>

export async function getEntityRelations(
  subjectType: EntityRelationEntityType,
  subjectId: string,
  predicate: EntityRelationPredicateType,
  objectType: EntityRelationEntityType,
  options: EntityRelationQueryOptions = {},
): Promise<EntityRelationResult[]> {
  const {
    minNetVoteScore,
    positiveNetVoteScore,
    limit = 100,
    sort = 'best',
    readOnly,
    after,
  } = options

  // Find the relation metadata
  const metadata = entityRelationMetadatum.find(
    m =>
      m.subject_type === subjectType && m.object_type === objectType && m.predicate === predicate,
  )

  if (!metadata) {
    throw new Error(`No entity relation found for ${subjectType} -> ${predicate} -> ${objectType}`)
  }

  const query = buildEntityRelationQuery(metadata, subjectId, {
    minNetVoteScore,
    positiveNetVoteScore,
    limit,
    sort,
    after,
  })

  const { rows } = await (readOnly === false ? write : read)(query)

  if (metadata.object_type === 'url') {
    const signingKeys = parseSigningKeys(process.env[SIDELOAD_SIGNING_KEYS_ENV])
    return (rows as EntityRelationResult[]).map(row => {
      const crawl = (
        row.object_data as {
          latest_crawl?: { title?: string | null; image_url?: string | null } | null
        }
      )?.latest_crawl
      if (!crawl?.image_url) return row
      const proxied = buildSideloadImageUrl(crawl.image_url, {
        imageOrigin: getImageOrigin(),
        width: 64,
        signingKeys,
      })
      if (!proxied)
        return {
          ...row,
          object_data: {
            ...(row.object_data as Record<string, unknown>),
            latest_crawl: { ...crawl, image_url: null },
          },
        }
      return {
        ...row,
        object_data: {
          ...(row.object_data as Record<string, unknown>),
          latest_crawl: { ...crawl, image_url: proxied },
        },
      }
    })
  }

  return rows as EntityRelationResult[]
}

export async function getEntityRelationsPage(
  subjectType: EntityRelationEntityType,
  subjectId: string,
  predicate: EntityRelationPredicateType,
  objectType: EntityRelationEntityType,
  options: EntityRelationQueryOptions = {},
): Promise<{ results: EntityRelationResult[]; hasNextPage: boolean }> {
  const limit = options.limit ?? 100
  const rows = await getEntityRelations(subjectType, subjectId, predicate, objectType, {
    ...options,
    limit: limit + 1,
  })
  return { results: rows.slice(0, limit), hasNextPage: rows.length > limit }
}

function buildEntityRelationQuery(
  metadata: (typeof entityRelationMetadatum)[number],
  subjectId: string,
  options: EntityRelationQueryOptions,
): SQLStatement {
  const { limit, sort, after } = options

  // Build SELECT clause
  const query = sql`/* buildEntityRelationQuery */
    SELECT
      r.subject_id,
      r.object_id,
      r.created_by_id,
      r.created_at,
      r.deleted_at,
      r.deleted_by_id,`
  if (metadata.election) {
    query.append(sql`
      r.id,
      r.votes_score_up,
      r.votes_score_none,
      r.votes_score_down,
      r.votes_count_up,
      r.votes_count_none,
      r.votes_count_down,
      r.votes_score_sort,
      r.votes_score_net,`)
  }
  if (metadata.order_index) {
    query.append(sql`
      r.order_index,`)
  }
  query.append(sql`
      to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at,
  `)

  // Add object entity data as JSON, with crawl metadata merged for URL objects
  if (metadata.object_type === 'url') {
    query.append(sql`
      (row_to_json(obj.*)::jsonb || jsonb_build_object(
        'latest_crawl', (
          SELECT json_build_object(
            'title', c.title,
            'image_url', coalesce(c.meta_tags->>'og:image', c.meta_tags->>'twitter:image')
          )
          FROM crawls c
          WHERE c.url_id = obj.id
            AND c.completed_at IS NOT NULL
            AND c.response_status_code = 200
            AND c.network_error IS NULL
          ORDER BY c.id DESC
          LIMIT 1
        )
      ))::json AS object_data
    FROM `)
  } else {
    query.append(sql`
      row_to_json(obj.*) AS object_data
    FROM `)
  }

  // Add table name (safe - comes from config)
  query.append(metadata.table_name)
  query.append(sql` AS r\n  `)

  // JOIN with object entity table — use select_table when set (e.g. view_users_public for users)
  // so row_to_json(obj.*) never exposes sensitive columns via foreign_key_table.
  const objectEntityConfig = getEntityConfig(metadata.object_type)
  query.append(sql`
    JOIN `)
  query.append(objectEntityConfig.select_table ?? objectEntityConfig.foreign_key_table)
  query.append(sql` AS obj ON r.object_id = obj.id
    `)

  // WHERE clause
  const filters: SQLStatement[] = []

  // Subject filter
  filters.push(sql`r.subject_id = ${subjectId}`)

  // Not deleted
  filters.push(sql`r.deleted_at IS NULL`)
  if (objectEntityConfig.has_soft_delete) {
    filters.push(sql`obj.deleted_at IS NULL`)
  }

  filters.push(...buildVoteScoreFilters(metadata, options))

  if (after) {
    if (sort === 'best' && metadata.election) {
      filters.push(
        sql`(r.votes_score_sort, r.created_at, r.object_id) < (${after.votesScoreSort}, ${after.createdAt}, ${after.id})`,
      )
    } else if (sort === 'newest' || !metadata.order_index) {
      filters.push(sql`(r.created_at, r.object_id) < (${after.createdAt}, ${after.id})`)
    } else {
      filters.push(sql`(r.order_index, r.object_id) > (${after.orderIndex}, ${after.id})`)
    }
  }

  // Apply filters
  if (filters.length > 0) {
    query.append(sql`\n    WHERE `)
    filters.forEach((filter, index) => {
      if (index > 0) query.append(sql`\n      AND `)
      query.append(filter)
    })
  }

  // ORDER BY clause
  // Note: sort=best on non-election relations falls back to order_index or created_at DESC
  query.append(sql`\n    ORDER BY `)
  if (sort === 'best' && metadata.election) {
    query.append(sql`r.votes_score_sort DESC, r.created_at DESC, r.object_id DESC`)
  } else if (sort === 'newest') {
    query.append(sql`r.created_at DESC, r.object_id DESC`)
  } else if (metadata.order_index) {
    query.append(sql`r.order_index ASC, r.object_id ASC`)
  } else {
    query.append(sql`r.created_at DESC, r.object_id DESC`)
  }

  // LIMIT (always applied since limit has a default value of 100)
  query.append(sql`\n    LIMIT ${limit}`)

  return query
}

function getEntityConfig(entityType: string) {
  const config = entityRelationEntityTables[entityType as EntityRelationEntityType]
  if (!config) throw new Error(`Unknown entity type: ${entityType}`)
  return config
}
