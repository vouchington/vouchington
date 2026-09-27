import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { getMaxUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import { removalFromRow } from './create.mts'
import type { BoilerplateRemoval } from './types.mts'

export const getLatestBoilerplateRemovalByHostnameAndPath = async (
  hostnameId: string,
  parentPath: string,
  queryOptions: QueryOptions = {},
): Promise<BoilerplateRemoval | null> => {
  const recentCutoffId = getMaxUUIDv7ForDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
  const { rows } = await read<Parameters<typeof removalFromRow>[0]>(
    sql`/* getLatestBoilerplateRemovalByHostnameAndPath */
    SELECT
      removal.id,
      removal.hostname_id,
      removal.parent_path,
      removal.created_at,
      removal.updated_at,
      COALESCE((
        SELECT jsonb_agg(value ORDER BY ordinal)
        FROM boilerplate_removal_results
        WHERE boilerplate_removal_id = removal.id AND kind = 'css_selector'
      ), '[]'::jsonb) AS css_selectors,
      COALESCE((
        SELECT jsonb_agg(value ORDER BY ordinal)
        FROM boilerplate_removal_results
        WHERE boilerplate_removal_id = removal.id AND kind = 'html'
      ), '[]'::jsonb) AS html_to_remove
    FROM boilerplate_removals removal
    WHERE removal.hostname_id = ${hostnameId}
      AND removal.parent_path = ${parentPath}
      AND removal.id > ${recentCutoffId}
    ORDER BY removal.id DESC
    LIMIT 1
    `,
    undefined,
    queryOptions,
  )

  return rows[0] ? removalFromRow(rows[0]) : null
}
