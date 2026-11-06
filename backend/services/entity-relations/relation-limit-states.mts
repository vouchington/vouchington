import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getRelationTypeLimit } from './relation-limits-config.mts'
import type { EntityRelationMetadata } from './metadata.mts'

export type LimitState = { capacity: number; remaining: number; existingObjectIds: string[] }
export type LimitGroup = {
  relation: EntityRelationMetadata
  objectIds: readonly string[]
  skipIfDeleted?: boolean
}
export type SubjectLimitGroup = LimitGroup & { subjectId: string }
export type RelationAdmission = { ids: Set<string>; state: LimitState | null }

export async function readRelationLimitStates(
  groups: readonly SubjectLimitGroup[],
  admitted: ReadonlyMap<string, RelationAdmission> | undefined,
  options?: QueryOptions,
): Promise<Map<string, LimitState>> {
  const limited = groups.flatMap(group => {
    const limit = getRelationTypeLimit(group.relation.table_name)
    return limit === null ? [] : [{ ...group, limit }]
  })
  if (limited.length === 0) return new Map()
  const query = sql`/* getRelationLimitState */ `
  for (const [index, group] of limited.entries()) {
    if (index > 0) query.append(' UNION ALL ')
    const table = group.relation.table_name
    const subjectId = group.subjectId
    const previous = admitted?.get(`${table}:${group.subjectId.toLowerCase()}`)
    const ids = [
      ...new Set([...group.objectIds.map(id => id.toLowerCase()), ...(previous?.ids ?? [])]),
    ]
    query.append(sql`SELECT ${table}::text AS table_name, ${subjectId}::uuid AS subject_id, ${group.limit}::int AS relation_limit,
      (SELECT count(*)::int FROM (SELECT 1 FROM `)
    // Identifiers are accepted only by the fixed config table allowlist.
    query.append(table)
    query.append(sql` WHERE subject_id = ${subjectId} AND deleted_at IS NULL`)
    if (table === 'relation__post__related__url')
      query.append(' ORDER BY created_at DESC, object_id DESC')
    query.append(sql` LIMIT ${group.limit}) capped) AS active_count,
      ARRAY(SELECT existing.object_id
        FROM unnest(${ids}::uuid[]) requested(object_id)
        -- LIMIT 1 keeps generic plans on unique-key probes instead of scanning a hot subject.
        CROSS JOIN LATERAL (SELECT existing.object_id FROM `)
    query.append(table)
    query.append(sql` existing WHERE existing.subject_id = ${subjectId}
      AND existing.object_id = requested.object_id
      AND (existing.deleted_at IS NULL OR ${group.skipIfDeleted === true})
      LIMIT 1) existing) AS existing_object_ids`)
  }
  const { rows } = await write<{
    table_name: string
    subject_id: string
    relation_limit: number
    active_count: number
    existing_object_ids: string[]
  }>(query, options)
  return new Map(
    rows.map(row => {
      const requested = new Set(
        limited
          .find(
            group =>
              group.relation.table_name === row.table_name &&
              group.subjectId.toLowerCase() === row.subject_id,
          )!
          .objectIds.map(id => id.toLowerCase()),
      )
      const active = new Set(row.existing_object_ids)
      const previous = admitted?.get(`${row.table_name}:${row.subject_id}`)
      const reservedOthers = [...(previous?.ids ?? [])].filter(
        id => !requested.has(id) && !active.has(id),
      ).length
      return [
        `${row.table_name}:${row.subject_id}`,
        {
          capacity: row.relation_limit,
          remaining: Math.max(0, row.relation_limit - row.active_count - reservedOthers),
          existingObjectIds: row.existing_object_ids,
        },
      ]
    }),
  )
}
