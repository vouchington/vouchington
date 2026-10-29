import { read, write } from '@data-stores/psql'
import { getTestEntityRelationVoteTable } from './entity-relation-fixture-tables.mts'
import sql from 'sql-template-strings'

export async function insertTestEntityRelationVote(options: {
  relationTable: string
  relationId: string
  subjectId: string
  userId: string
  score: -1 | 0 | 1
  id?: string
}): Promise<void> {
  const voteTable = getTestEntityRelationVoteTable(options.relationTable)
  await write(
    sql`/* insertTestEntityRelationVote */ INSERT INTO `.append(voteTable)
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
  const voteTable = getTestEntityRelationVoteTable(options.relationTable)
  const { rows } = await read<{ score: number }>(
    sql`/* getLatestTestEntityRelationVoteScore */ SELECT score FROM `.append(voteTable)
      .append(sql` WHERE entity_relation_id = ${options.relationId}
        AND user_id = ${options.userId} ORDER BY id DESC LIMIT 1`),
  )
  return rows[0]?.score
}

/** Read only this fixture user's bounded ballot page for replay assertions. */
export async function readTestEntityRelationUserVotePage(
  userId: string,
  relationTable: string,
  pagination: { limit: number; after?: string },
): Promise<Array<{ id: string; entity_relation_id: string; score: number | null }>> {
  const statement = sql`/* readTestEntityRelationUserVotePage */
    SELECT id, entity_relation_id, score FROM `
  statement.append(getTestEntityRelationVoteTable(relationTable))
  statement.append(sql` WHERE user_id = ${userId}`)
  if (pagination.after) statement.append(sql` AND id > ${pagination.after}::uuid`)
  statement.append(sql` ORDER BY id LIMIT ${pagination.limit}`)
  return (await read<{ id: string; entity_relation_id: string; score: number | null }>(statement))
    .rows
}
