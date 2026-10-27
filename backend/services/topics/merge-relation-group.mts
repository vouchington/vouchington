import type { TransactionQuery } from '@data-stores/psql'
import { relationElectionTables, relationReferences } from './merge-relations.mts'

export type ElectedTopicRelation = {
  id: string
  subject_id: string
  object_id: string
  deleted_at: Date | null
  priority: number
}
export type ElectedTopicRelationGroup = {
  table: keyof typeof relationReferences
  nextSubjectId: string
  nextObjectId: string
  selfDelete: boolean
  relations: ElectedTopicRelation[]
}
export type TopicRelationFlagConflict = {
  kind: 'audit_flag' | 'self_relation_audit_flag'
  sourceId: string
  destinationId: string
}

type RelationPair = { subject_id: string; object_id: string }
type CompanionRow = Omit<ElectedTopicRelation, 'priority'> & { group_index: number }

/** One bounded page discovers at most four exact companions per source pair in one query. */
export async function inspectElectedTopicRelationGroups(
  query: TransactionQuery,
  table: keyof typeof relationReferences,
  sourceTopicId: string,
  destinationTopicId: string,
  pairs: readonly RelationPair[],
): Promise<ElectedTopicRelationGroup[]> {
  if (!relationElectionTables.has(table))
    throw new TypeError(`Not an elected topic relation: ${table}`)
  if (!pairs.length) return []
  const columns: readonly string[] = relationReferences[table]
  const groups = pairs.map(({ subject_id: oldSubjectId, object_id: oldObjectId }) => {
    const nextSubjectId =
      columns.includes('subject_id') && oldSubjectId === sourceTopicId
        ? destinationTopicId
        : oldSubjectId
    const nextObjectId =
      columns.includes('object_id') && oldObjectId === sourceTopicId
        ? destinationTopicId
        : oldObjectId
    return {
      table,
      nextSubjectId,
      nextObjectId,
      selfDelete: columns.length === 2 && nextSubjectId === nextObjectId,
      relations: [] as ElectedTopicRelation[],
    }
  })
  const requested = groups.flatMap((group, index) => {
    const subjects =
      columns.includes('subject_id') && group.nextSubjectId === destinationTopicId
        ? [sourceTopicId, destinationTopicId]
        : [group.nextSubjectId]
    const objects =
      columns.includes('object_id') && group.nextObjectId === destinationTopicId
        ? [sourceTopicId, destinationTopicId]
        : [group.nextObjectId]
    return subjects.flatMap(subjectId =>
      objects.map(objectId => ({ groupIndex: index, subjectId, objectId })),
    )
  })
  const { rows } = await query<CompanionRow>(
    `/* inspectElectedTopicRelationGroups */ WITH requested(group_index, subject_id, object_id) AS (
      SELECT * FROM unnest($1::integer[], $2::uuid[], $3::uuid[])
    ) SELECT requested.group_index, companion.id, companion.subject_id,
      companion.object_id, companion.deleted_at FROM requested
    CROSS JOIN LATERAL (
      SELECT id, subject_id, object_id, deleted_at FROM ${table}
      WHERE subject_id = requested.subject_id AND object_id = requested.object_id
      ORDER BY id LIMIT 1
    ) companion`,
    [
      requested.map(item => item.groupIndex),
      requested.map(item => item.subjectId),
      requested.map(item => item.objectId),
    ],
  )
  for (const row of rows) {
    const group = groups[row.group_index]!
    if (!group.selfDelete || sourceEndpointCount(row, columns, sourceTopicId) > 0)
      group.relations.push({
        id: row.id,
        subject_id: row.subject_id,
        object_id: row.object_id,
        deleted_at: row.deleted_at,
        priority: 0,
      })
  }
  for (const group of groups) {
    group.relations.sort((left, right) => {
      if ((left.deleted_at === null) !== (right.deleted_at === null))
        return left.deleted_at === null ? -1 : 1
      const leftSourceCount = sourceEndpointCount(left, columns, sourceTopicId)
      const rightSourceCount = sourceEndpointCount(right, columns, sourceTopicId)
      if (leftSourceCount !== rightSourceCount) return leftSourceCount - rightSourceCount
      return right.id.localeCompare(left.id)
    })
    group.relations.forEach((relation, index) => {
      relation.priority = index + 1
    })
  }
  return groups
}

export async function inspectElectedTopicRelationGroup(
  query: TransactionQuery,
  table: keyof typeof relationReferences,
  sourceTopicId: string,
  destinationTopicId: string,
  oldSubjectId: string,
  oldObjectId: string,
): Promise<ElectedTopicRelationGroup> {
  const groups = await inspectElectedTopicRelationGroups(
    query,
    table,
    sourceTopicId,
    destinationTopicId,
    [{ subject_id: oldSubjectId, object_id: oldObjectId }],
  )
  return groups[0]!
}

export function sourceEndpointCount(
  relation: Pick<ElectedTopicRelation, 'subject_id' | 'object_id'>,
  columns: readonly string[],
  sourceTopicId: string,
): number {
  return (
    Number(columns.includes('subject_id') && relation.subject_id === sourceTopicId) +
    Number(columns.includes('object_id') && relation.object_id === sourceTopicId)
  )
}
