/* oxlint-disable no-await-in-loop -- fixed relation families and ordered stream consumption use bounded pages serially. */
import { getEntityRelationVoteTableIdentifier } from '@data-stores/psql/config-driven/utils/election-sql-identifiers'
import type { QueryExecutor } from '@data-stores/psql/types'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import sql from 'sql-template-strings'

export type RelationVoteCandidate = {
  id: string
  entity_relation: string
  subject_id: string
  entity_relation_id: string
}

/** Merge bounded index pages from the fixed elected-relation catalog. */
export async function getRelationVoteCandidates(
  query: QueryExecutor,
  userId: string,
  batchSize: number,
): Promise<RelationVoteCandidate[]> {
  const candidates: RelationVoteCandidate[] = []
  for (const { table_name: family } of entityRelationMetadatum.filter(
    metadata => metadata.election,
  )) {
    const statement = sql`/* deleteUserEntityRelationVotesBatch:candidates */
      SELECT id, ${family}::elected_entity_relations AS entity_relation, subject_id, entity_relation_id
      FROM `
    statement.append(getEntityRelationVoteTableIdentifier(family))
    statement.append(sql` WHERE user_id = ${userId} ORDER BY id LIMIT ${batchSize}`)
    // no-mistakes-disable-next-line query-reached-per-item: fixed metadata families each read at most batchSize user-owned events in one deletion transaction
    const { rows } = await query<RelationVoteCandidate>(statement)
    candidates.push(...rows)
  }
  return candidates.toSorted((left, right) => left.id.localeCompare(right.id)).slice(0, batchSize)
}
