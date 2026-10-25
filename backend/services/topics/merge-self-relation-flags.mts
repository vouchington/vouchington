import type { TransactionQuery } from '@data-stores/psql'
import { createCodedError } from '@vouchington/sentry'
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
  // The finite schema inventory supplies a stable table order. A one-row prior aggregate is the
  // outer source for each later table, so an empty table cannot skip the preceding row locks.
  const lockCtes = selfDeletingVotedTopicRelationTables.map(([table], index) => {
    const lockRows = `SELECT r.id FROM ${table} r
      WHERE ${wouldBecomeSelfRelation('r')}
        ${index === 0 ? '' : 'AND prior.prior_count >= 0'}
      ORDER BY r.id FOR UPDATE`
    return index === 0
      ? `locks0 AS MATERIALIZED (${lockRows})`
      : `locks${index} AS MATERIALIZED (
          SELECT locked.id FROM (SELECT count(*) AS prior_count FROM locks${index - 1}) prior
          CROSS JOIN LATERAL (${lockRows}) locked
        )`
  })
  if (lockCtes.length === 0) return
  const drainedLocks = lockCtes
    .map((_, index) => `(SELECT count(*) FROM locks${index})`)
    .join(' + ')
  await query(
    `/* lockTopicMergeSelfRelations */
    WITH ${lockCtes.join(',\n')}
    SELECT ${drainedLocks}`,
    [sourceTopicId, destinationTopicId],
  )

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
