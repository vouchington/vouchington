import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { getPaginationLimit } from '@services/pagination/config'
import sql from 'sql-template-strings'

export const updateCrawlerCssSelectorsByHostname = async (
  hostnameId: string,
  cssSelectorsToRemove: string[],
  queryOptions: QueryOptions = {},
): Promise<boolean> => {
  const selectorsToAppend = [...new Set(cssSelectorsToRemove)]
  if (selectorsToAppend.length === 0) return false

  const batchSize = getPaginationLimit('bulk_default_limit')
  let updated = false
  while (true) {
    // oxlint-disable no-await-in-loop -- bounded batch UPDATE appends missing selectors across this hostname's crawler configurations
    // no-mistakes-disable-next-line query-reached-per-item: batched UPDATE over one hostname's crawler configurations in DynamicConfig bulk_default_limit pages (hard max 100)
    const { rowCount } = await write(
      sql`/* updateCrawlerCssSelectorsByHostname */
      WITH target AS (
        SELECT id
        FROM hostname_crawler_configurations
        WHERE hostname_id = ${hostnameId}
          AND deleted_at IS NULL
          AND EXISTS (
            SELECT 1
            FROM unnest(${selectorsToAppend}::TEXT[]) AS candidate(value)
            WHERE NOT (
              candidate.value = ANY(COALESCE(hostname_crawler_configurations.css_selectors_to_remove, ARRAY[]::TEXT[]))
            )
          )
        ORDER BY id
        LIMIT ${batchSize}
      )
      UPDATE hostname_crawler_configurations config
      SET css_selectors_to_remove = (
        SELECT ARRAY_AGG(value ORDER BY first_ord ASC)
        FROM (
          SELECT value, MIN(ord) AS first_ord
          FROM unnest(
            COALESCE(config.css_selectors_to_remove, ARRAY[]::TEXT[]) || ${selectorsToAppend}::TEXT[]
          ) WITH ORDINALITY AS selectors(value, ord)
          GROUP BY value
        ) deduped
      )
      FROM target
      WHERE config.id = target.id
    `,
      undefined,
      queryOptions,
    )
    // oxlint-enable no-await-in-loop
    const count = rowCount ?? 0
    if (count > 0) updated = true
    if (count < batchSize) break
  }

  return updated
}
