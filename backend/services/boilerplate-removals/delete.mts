import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export const deleteBoilerplateRemovalsByHostnameId = async (
  hostnameId: string,
  queryOptions: QueryOptions = {},
): Promise<void> => {
  await write(
    sql`/* deleteBoilerplateRemovalsByHostnameId */ DELETE FROM boilerplate_removals WHERE hostname_id = ${hostnameId}`,
    undefined,
    queryOptions,
  )
}
