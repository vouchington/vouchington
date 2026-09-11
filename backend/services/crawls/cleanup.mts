import { write } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'

export const deleteOldInvalidCrawls = async (daysOld: number = 30): Promise<number> => {
  const cutoffId = getMinUUIDv7ForDate(new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000))
  const { rows } = await write(
    `/* deleteOldInvalidCrawls */
    DELETE FROM crawls
    WHERE id < $1
      AND (
        network_error IS NOT NULL
        OR completed_at IS NULL
      )
    RETURNING url_id, id
  `,
    [cutoffId],
  )
  return rows.length
}
