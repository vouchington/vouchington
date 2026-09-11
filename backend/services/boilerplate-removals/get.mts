import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { getMaxUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import type { BoilerplateRemoval } from './types.mts'

export const getLatestBoilerplateRemovalByHostnameAndPath = async (
  hostnameId: string,
  parentPath: string,
  queryOptions: QueryOptions = {},
): Promise<BoilerplateRemoval | null> => {
  const recentCutoffId = getMaxUUIDv7ForDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
  const { rows } = await read(
    sql`/* getLatestBoilerplateRemovalByHostnameAndPath */
    SELECT *
    FROM boilerplate_removals
    WHERE hostname_id = ${hostnameId}
      AND parent_path = ${parentPath}
      AND id > ${recentCutoffId}
    ORDER BY id DESC
    LIMIT 1
    `,
    undefined,
    queryOptions,
  )

  return rows[0] ?? null
}
