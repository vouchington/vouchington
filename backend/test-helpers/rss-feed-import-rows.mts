import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** The row ids of a user RSS feed import, in input order. */
export async function getRssFeedImportRowIds(importId: string): Promise<string[]> {
  const { rows } = await read(
    sql`/* getRssFeedImportRowIds */
      SELECT id
      FROM user_rss_feed_import_rows
      WHERE batch_id = ${importId}
      ORDER BY row_index
    `,
  )
  return (rows as Array<{ id: string }>).map(row => row.id)
}

/** The first row id of a user RSS feed import. */
export async function getFirstRssFeedImportRowId(importId: string): Promise<string> {
  const [rowId] = await getRssFeedImportRowIds(importId)
  if (!rowId) throw new Error(`Import ${importId} has no rows`)
  return rowId
}
