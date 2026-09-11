import { write, type QueryOptions } from '@data-stores/psql'
import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import sql from 'sql-template-strings'

const relationTables = new Set(entityRelationMetadatum.map(relation => relation.table_name))

export async function getTestEntityRelationVoteState(
  tableName: string,
  entityRelationId: string,
  options: QueryOptions,
): Promise<{ votes_score_net: number; user_id: string; score: number } | null> {
  if (!relationTables.has(tableName)) throw new Error(`Invalid relation table name: ${tableName}`)
  const query =
    sql`/* getTestEntityRelationVoteState */ SELECT relation.votes_score_net, vote.user_id, vote.score
    FROM `.append(tableName)
      .append(sql` relation JOIN entity_relation_votes vote ON vote.entity_relation_id = relation.id
      WHERE relation.id = ${entityRelationId}`)
  const { rows } = await write<{ votes_score_net: number; user_id: string; score: number }>(
    query,
    options,
  )
  return rows[0] ?? null
}
