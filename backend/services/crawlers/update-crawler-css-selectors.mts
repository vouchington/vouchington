import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export const updateCrawlerCssSelectorsByHostname = async (
  hostnameId: string,
  cssSelectorsToRemove: string[],
  queryOptions: QueryOptions = {},
): Promise<boolean> => {
  const selectorsToAppend = [...new Set(cssSelectorsToRemove)]
  if (selectorsToAppend.length === 0) return false

  const { rowCount } = await write(
    sql`/* updateCrawlerCssSelectorsByHostname */
    UPDATE hostname_crawler_configurations
    SET css_selectors_to_remove = (
      SELECT ARRAY_AGG(value ORDER BY first_ord ASC)
      FROM (
        SELECT value, MIN(ord) AS first_ord
        FROM unnest(
          COALESCE(hostname_crawler_configurations.css_selectors_to_remove, ARRAY[]::TEXT[]) || ${selectorsToAppend}::TEXT[]
        ) WITH ORDINALITY AS selectors(value, ord)
        GROUP BY value
      ) deduped
    )
    WHERE hostname_id = ${hostnameId}
      AND deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM unnest(${selectorsToAppend}::TEXT[]) AS candidate(value)
        WHERE NOT (
          candidate.value = ANY(COALESCE(hostname_crawler_configurations.css_selectors_to_remove, ARRAY[]::TEXT[]))
        )
      )
  `,
    undefined,
    queryOptions,
  )

  return (rowCount ?? 0) > 0
}
