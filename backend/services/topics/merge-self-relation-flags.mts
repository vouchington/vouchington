import type { TransactionQuery } from '@data-stores/psql'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { mapped } from './merge-reference-sql.mts'
import { relationElectionTables, relationReferences } from './merge-relations.mts'

const selfDeletingVotedTopicRelationTables = Object.entries(relationReferences).filter(
  ([table, columns]) => columns.length === 2 && relationElectionTables.has(table),
)

function wouldBecomeSelfRelation(alias: string): string {
  return `(${alias}.subject_id = $1::uuid OR ${alias}.object_id = $1::uuid)
    AND ${mapped(`${alias}.subject_id`)} = ${mapped(`${alias}.object_id`)}`
}

/** Lock FK parents before checking flags; the check needs a fresh snapshot after any lock wait. */
export async function lockAndAssertTopicMergeSelfRelationFlags(
  query: TransactionQuery,
  sourceTopicId: string,
  destinationTopicId: string,
): Promise<void> {
  // The finite schema inventory supplies a stable table order; each query locks rows in id order.
  for (const [table] of selfDeletingVotedTopicRelationTables) {
    // oxlint-disable-next-line no-await-in-loop -- relation row locks must follow the stable schema order
    await query(
      `/* lockTopicMergeSelfRelations */
      SELECT r.id FROM ${table} r
      WHERE ${wouldBecomeSelfRelation('r')}
      ORDER BY r.id FOR UPDATE`,
      [sourceTopicId, destinationTopicId],
    )
  }

  const flagQueries = selfDeletingVotedTopicRelationTables.map(
    ([table]) => `SELECT '${table}'::text AS relation_table, r.id AS relation_id, flag.id AS flag_id
      FROM ${table} r
      JOIN vote_integrity_flags flag ON flag.${table}_subject_id = r.subject_id
        AND flag.${table}_id = r.id AND flag.resolved_at IS NULL
      WHERE ${wouldBecomeSelfRelation('r')}`,
  )
  const { rows } = await query<{
    relation_table: string
    relation_id: string
    flag_id: string
  }>(
    `/* assertLockedTopicMergeSelfRelationFlags */
    SELECT relation_table, relation_id, flag_id FROM (${flagQueries.join(' UNION ALL ')}) pending
    ORDER BY relation_table, relation_id, flag_id LIMIT 1`,
    [sourceTopicId, destinationTopicId],
  )
  const conflict = rows[0]
  if (!conflict) return
  throw Object.assign(
    createCodedError(
      409,
      `Cannot merge topics: relation ${conflict.relation_id} (${conflict.relation_table}) has unresolved vote integrity flag ${conflict.flag_id}`,
      'topic_merge_reference_conflict',
    ),
    { source_id: conflict.relation_id, destination_id: conflict.flag_id },
  )
}
