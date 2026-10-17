import { read, type QueryExecutor } from '@data-stores/psql'
import { getEntityRelationVoteTableIdentifier } from '@data-stores/psql/config-driven/utils/election-sql-identifiers'
import sql from 'sql-template-strings'

export type RelationUserVoteRow = {
  id: string
  user_id: string
  subject_id: string
  entity_relation_id: string
  score: number | null
  created_at: Date
}

/** Index-ordered event page from one concrete relation ledger. */
export async function readEntityRelationUserVotePage(
  userId: string,
  relationTable: string,
  pagination: { limit: number; after?: string },
  run: QueryExecutor = read,
): Promise<RelationUserVoteRow[]> {
  const statement = sql`/* readEntityRelationUserVotePage */
    SELECT id, user_id, subject_id, entity_relation_id, score, created_at FROM `
  statement.append(getEntityRelationVoteTableIdentifier(relationTable))
  statement.append(sql` WHERE user_id = ${userId}`)
  if (pagination.after) statement.append(sql` AND id > ${pagination.after}::uuid`)
  statement.append(sql` ORDER BY id LIMIT ${pagination.limit}`)
  return (await run<RelationUserVoteRow>(statement)).rows
}
