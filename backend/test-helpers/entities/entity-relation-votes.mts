import { read, write } from '@data-stores/psql'
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
  id?: string
}): Promise<void> {
  const metadata = entityRelationMetadatum.find(
    relation => relation.table_name === options.relationTable,
  )
  if (!metadata?.election) throw new Error(`Invalid election relation: ${options.relationTable}`)
  await write(
    sql`INSERT INTO `.append(getEntityRelationVoteTableName(metadata))
      .append(sql` (user_id, subject_id, entity_relation_id, score, id)
        VALUES (${options.userId}, ${options.subjectId},
          ${options.relationId}, ${options.score}, COALESCE(${options.id ?? null}::uuid, uuidv7()))`),
  )
}

export async function getLatestTestEntityRelationVoteScore(options: {
  relationTable: string
  relationId: string
  userId: string
}): Promise<number | undefined> {
  const metadata = entityRelationMetadatum.find(
    relation => relation.table_name === options.relationTable,
  )
  if (!metadata?.election) throw new Error(`Invalid election relation: ${options.relationTable}`)
  const { rows } = await read<{ score: number }>(
    sql`/* getLatestTestEntityRelationVoteScore */ SELECT score FROM `.append(
      getEntityRelationVoteTableName(metadata),
    ).append(sql` WHERE entity_relation_id = ${options.relationId}
        AND user_id = ${options.userId} ORDER BY id DESC LIMIT 1`),
  )
  return rows[0]?.score
}
