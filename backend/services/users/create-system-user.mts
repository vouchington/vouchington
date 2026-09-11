import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export async function createAgentSystemUser(
  username: string,
  options?: QueryOptions,
): Promise<{ id: string }> {
  const { rows } = await write(
    sql`/* createAgentSystemUser */
    INSERT INTO users (username)
    VALUES (${username})
    RETURNING id
    `,
    options,
  )
  return rows[0]
}
