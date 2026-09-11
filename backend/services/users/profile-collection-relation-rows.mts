import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { RelationTableName } from './profile-collection-tables.mts'

export type RelationEntityRow = {
  entity_id: string
  created_us: number
}

export async function getRelationObjectRows(
  tableName: RelationTableName,
  userId: string,
  limit: number,
  options: QueryOptions,
  filters: { after?: { timestamp: number; id: string }; query?: string } = {},
): Promise<RelationEntityRow[]> {
  const params: unknown[] = [userId, limit]
  const conditions = ['r.subject_id = $1', 'r.deleted_at IS NULL']
  const joins: string[] = []

  if (filters.query) {
    joins.push('JOIN users u ON u.id = r.object_id')
    const queryParam = params.push(`${escapeLikePattern(filters.query.toLowerCase())}%`)
    conditions.push(`LOWER(u.username) LIKE $${queryParam} ESCAPE '\\'`)
  }

  if (filters.after) {
    const timestampParam = params.push(filters.after.timestamp)
    const idParam = params.push(filters.after.id)
    conditions.push(
      `(r.created_at, r.object_id) < (TO_TIMESTAMP($${timestampParam}::numeric / 1000000), $${idParam}::uuid)`,
    )
  }

  const { rows } = await read<{ entity_id: string; created_us: string }>(
    `/* getRelationObjectRows */
    SELECT r.object_id AS entity_id,
           (EXTRACT(EPOCH FROM r.created_at) * 1000000)::bigint AS created_us
    FROM ${tableName} r
    ${joins.join('\n    ')}
    WHERE ${conditions.join('\n      AND ')}
    ORDER BY r.created_at DESC, r.object_id DESC
    LIMIT $2
    `,
    params,
    options,
  )

  return rows.map(row => ({
    entity_id: row.entity_id,
    created_us: Number(row.created_us),
  }))
}

export async function getRelationSubjectRows(
  tableName: RelationTableName,
  userId: string,
  limit: number,
  options: QueryOptions,
  filters: { after?: { timestamp: number; id: string }; query?: string } = {},
): Promise<RelationEntityRow[]> {
  const params: unknown[] = [userId, limit]
  const conditions = ['r.object_id = $1', 'r.deleted_at IS NULL']
  const joins: string[] = []

  if (filters.query) {
    joins.push('JOIN users u ON u.id = r.subject_id')
    const queryParam = params.push(`${escapeLikePattern(filters.query.toLowerCase())}%`)
    conditions.push(`LOWER(u.username) LIKE $${queryParam} ESCAPE '\\'`)
  }

  if (filters.after) {
    const timestampParam = params.push(filters.after.timestamp)
    const idParam = params.push(filters.after.id)
    conditions.push(
      `(r.created_at, r.subject_id) < (TO_TIMESTAMP($${timestampParam}::numeric / 1000000), $${idParam}::uuid)`,
    )
  }

  const { rows } = await read<{ entity_id: string; created_us: string }>(
    `/* getRelationSubjectRows */
    SELECT r.subject_id AS entity_id,
           (EXTRACT(EPOCH FROM r.created_at) * 1000000)::bigint AS created_us
    FROM ${tableName} r
    ${joins.join('\n    ')}
    WHERE ${conditions.join('\n      AND ')}
    ORDER BY r.created_at DESC, r.subject_id DESC
    LIMIT $2
    `,
    params,
    options,
  )

  return rows.map(row => ({
    entity_id: row.entity_id,
    created_us: Number(row.created_us),
  }))
}

// Escape LIKE metacharacters so they are treated as literals in the prefix-match filter above.
function escapeLikePattern(pattern: string): string {
  return pattern.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}
