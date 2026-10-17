import { write } from '@data-stores/psql'
import { UnrecoverableError } from '@modules/queue-errors'
import { isUUID } from '@modules/utils'
import {
  enqueueBulkUserRssFeedImportRows,
  enqueueUserRssFeedImportDispatchContinuation,
} from '@queues/user-rss-feed-imports/enqueues'
import sql from 'sql-template-strings'
import { getUserImportExportConfig } from './config.mts'

type PendingRow = { id: string; row_index: number }

type DispatchDependencies = {
  enqueueContinuation: (importId: string, cursor: number) => Promise<unknown>
  enqueueRows: typeof enqueueBulkUserRssFeedImportRows
}

const defaultDependencies: DispatchDependencies = {
  enqueueContinuation: enqueueUserRssFeedImportDispatchContinuation,
  enqueueRows: enqueueBulkUserRssFeedImportRows,
}

/**
 * Puts one page of an import's pending rows on the queue, then continues from the page's last row.
 * At most one page per import waits on the queue, so concurrent imports take turns instead of one
 * large import filling the ready list. Rows that already finished are not pending, so a repeated
 * run enqueues only what is outstanding.
 */
export async function dispatchUserRssFeedImport(
  data: { importId: string; cursor?: number },
  dependencies: Partial<DispatchDependencies> = {},
): Promise<void> {
  const { enqueueContinuation, enqueueRows } = { ...defaultDependencies, ...dependencies }
  if (!isUUID(data.importId)) throw new UnrecoverableError(`Invalid import ${data.importId}`)

  const pageSize = getUserImportExportConfig().import_dispatch_page_size
  const pending = await readPendingRows(data.importId, data.cursor ?? -1, pageSize + 1)
  const page = pending.slice(0, pageSize)
  if (page.length === 0) return

  await enqueueRows(page.map(row => ({ importId: data.importId, rowId: row.id })))
  // The cursor advances only once the page is on the queue.
  if (pending.length > pageSize) {
    await enqueueContinuation(data.importId, page[page.length - 1]!.row_index)
  }
}

async function readPendingRows(
  importId: string,
  afterRowIndex: number,
  limit: number,
): Promise<PendingRow[]> {
  // The primary, not the replica: the import was inserted moments ago, and a lagging replica that
  // returned no rows would end the import without a single row ever running.
  const { rows } = await write(
    sql`/* readPendingUserRssFeedImportRows */
      SELECT id, row_index
      FROM user_rss_feed_import_rows
      WHERE batch_id = ${importId}
        AND row_index > ${afterRowIndex}
        AND completed_at IS NULL
        AND failed_at IS NULL
      ORDER BY row_index
      LIMIT ${limit}
    `,
  )
  return rows as PendingRow[]
}
