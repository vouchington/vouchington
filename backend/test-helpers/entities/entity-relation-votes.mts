import { write } from '@data-stores/psql'
import {
  entityRelationMetadatum,
  getEntityRelationVoteTableName,
} from '@voucha/types/entities/entity-relations-metadata'
import sql from 'sql-template-strings'

export async function insertTestEntityRelationVote(options: {
  relationTable: string
  relationId: string
  subjectId: string
  userId: string
  score: -1 | 0 | 1
}): Promise<void> {
  const metadata = entityRelationMetadatum.find(
    relation => relation.table_name === options.relationTable,
  )
  if (!metadata?.election) throw new Error(`Invalid election relation: ${options.relationTable}`)
  await write(
    sql`INSERT INTO `.append(getEntityRelationVoteTableName(metadata))
      .append(sql` (relation_table, user_id, subject_id, entity_relation_id, score)
        VALUES (${options.relationTable}, ${options.userId}, ${options.subjectId},
          ${options.relationId}, ${options.score})`),
  )
}
