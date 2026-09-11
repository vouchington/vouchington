import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type FollowerInfoForNotification = {
  username: string | null
  referrer_id: string | null
}

export async function getFollowerInfoForNotification(
  followerId: string,
): Promise<FollowerInfoForNotification | null> {
  const { rows } = await read(sql`/* getFollowerInfoForNotification */
    SELECT username, referrer_id
    FROM users
    WHERE id = ${followerId}
    LIMIT 1
  `)

  const row = rows[0]
  if (!row) return null
  return {
    username: (row.username as string | null) ?? null,
    referrer_id: (row.referrer_id as string | null) ?? null,
  }
}
