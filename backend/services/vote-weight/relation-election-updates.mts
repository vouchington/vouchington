import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Operator recovery re-derives all user targets even when the saved weight is unchanged. */
export async function findUsersForElectionVoteReplay(afterId: string | null, limit: number) {
  // Page retained identities before filtering: a deleted-user tail cannot expand this read.
  const statement = sql`/* findUsersForElectionVoteReplay */ SELECT id, deleted_at FROM users`
  if (afterId) statement.append(sql` WHERE id > ${afterId}::uuid`)
  statement.append(sql` ORDER BY id LIMIT ${limit}`)
  const { rows } = await read<{ id: string; deleted_at: Date | null }>(statement)
  return {
    userIds: rows.filter(row => row.deleted_at === null).map(row => row.id),
    nextCursor: rows.length === limit ? rows.at(-1)!.id : null,
  }
}
