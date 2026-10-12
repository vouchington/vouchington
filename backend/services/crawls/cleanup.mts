import { write } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'

export const deleteOldInvalidCrawls = async (
  daysOld: number = 30,
  crawlId?: string,
): Promise<number> => {
  const cutoffId = getMinUUIDv7ForDate(new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000))
  const query = sql`/* deleteOldInvalidCrawls */
    DELETE FROM crawls
    WHERE id < ${cutoffId}::uuid
  `
  if (crawlId) query.append(sql` AND id = ${crawlId}::uuid`)
  query.append(sql`
      AND (
        network_error IS NOT NULL
        OR completed_at IS NULL
      )
    RETURNING url_id, id
  `)
  const { rows } = await write(query)
  return rows.length
}
