import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export async function createAgentSystemUser(
  username: string,
  options?: QueryOptions,
): Promise<{ id: string }> {
  const { rows } = await write<{ id: string }>(
    sql`/* createAgentSystemUser */
    INSERT INTO users (username, platform_account_kind)
    VALUES (${username}, 'system')
    RETURNING id
    `,
    options,
  )
  return rows[0]
}
