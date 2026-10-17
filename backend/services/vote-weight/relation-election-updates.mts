import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Operator recovery re-derives all user targets even when the saved weight is unchanged. */
export async function findUsersForElectionVoteReplay(afterId: string | null, limit: number) {
  const statement = sql`/* findUsersForElectionVoteReplay */ SELECT id FROM users
    WHERE deleted_at IS NULL`
  if (afterId) statement.append(sql` AND id > ${afterId}::uuid`)
  statement.append(sql` ORDER BY id LIMIT ${limit}`)
  const { rows } = await read<{ id: string }>(statement)
  return {
    userIds: rows.map(row => row.id),
    nextCursor: rows.length === limit ? rows.at(-1)!.id : null,
  }
}
