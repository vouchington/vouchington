import { read, type QueryOptions } from '@data-stores/psql'
import type { PrivateUser } from '@voucha/types/entities/user'
import sql from 'sql-template-strings'

export async function getTestPrivateUserById(
  userId: string,
  options?: QueryOptions,
): Promise<PrivateUser | null> {
  const { rows } = await read(
    sql`/* getTestPrivateUserById */
    SELECT * FROM view_users_private WHERE id = ${userId} LIMIT 1
  `,
    options,
  )
  return (rows[0] as PrivateUser | undefined) ?? null
}
