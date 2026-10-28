import type { TransactionQuery } from '@data-stores/psql'
import { relationReferences } from './merge-relations.mts'
import {
  sourceEndpointCount,
  type ElectedTopicRelation,
  type ElectedTopicRelationGroup,
  type TopicRelationFlagConflict,
} from './merge-relation-group.mts'

type FlagRow = { relation_id: string; id: string; flag_type: string }

/** At most two pending flags per selected companion, across the whole bounded page. */
export async function findElectedTopicRelationFlagConflicts(
  query: TransactionQuery,
  groups: readonly ElectedTopicRelationGroup[],
  sourceTopicId: string,
): Promise<Array<TopicRelationFlagConflict | null>> {
  const ids = [...new Set(groups.flatMap(group => group.relations.map(relation => relation.id)))]
  if (!ids.length) return groups.map(() => null)
  const table = groups[0]!.table
  if (groups.some(group => group.table !== table))
    throw new Error('Mixed relation tables in one page')
  const { rows } = await query<FlagRow>(
    `/* findElectedTopicRelationFlagConflicts */ SELECT selected.relation_id, flag.id, flag.flag_type
    FROM unnest($1::uuid[]) selected(relation_id)
    CROSS JOIN LATERAL (
      SELECT id, flag_type FROM vote_integrity_flags
      WHERE ${table}_id = selected.relation_id AND resolved_at IS NULL
      ORDER BY id LIMIT 2
    ) flag`,
    [ids],
  )
  const flagsByRelation = new Map<string, FlagRow[]>()
  for (const flag of rows) {
    const flags = flagsByRelation.get(flag.relation_id) ?? []
    flags.push(flag)
    flagsByRelation.set(flag.relation_id, flags)
  }
  return groups.map(group => conflictForGroup(group, flagsByRelation, sourceTopicId))
}

function conflictForGroup(
  group: ElectedTopicRelationGroup,
  flagsByRelation: ReadonlyMap<string, FlagRow[]>,
  sourceTopicId: string,
): TopicRelationFlagConflict | null {
  const flagsByType = new Map<string, { id: string; relation: ElectedTopicRelation }>()
  const columns: readonly string[] = relationReferences[group.table]
  for (const relation of group.relations) {
    const flags = flagsByRelation.get(relation.id) ?? []
    if (group.selfDelete && flags[0])
      return {
        kind: 'self_relation_audit_flag',
        sourceId: relation.id,
        destinationId: flags[0].id,
      }
    for (const flag of flags) {
      const earlier = flagsByType.get(flag.flag_type)
      if (earlier && earlier.relation.id !== relation.id) {
        const currentIsSource = sourceEndpointCount(relation, columns, sourceTopicId) > 0
        return {
          kind: 'audit_flag',
          sourceId: currentIsSource ? flag.id : earlier.id,
          destinationId: currentIsSource ? earlier.id : flag.id,
        }
      }
      flagsByType.set(flag.flag_type, { id: flag.id, relation })
    }
  }
  return null
}
