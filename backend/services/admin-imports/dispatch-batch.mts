import { getAdminImportsWorkLimit } from '@queues/admin-imports/config'
import {
  enqueueAdminTopicImportDispatchContinuation,
  enqueueBulkAdminTopicImportRows,
} from '@queues/admin-imports/enqueues'
import { write } from '@data-stores/psql'
import { UnrecoverableError } from '@modules/queue-errors'
import { isUUID } from '@modules/utils'
import sql from 'sql-template-strings'

type PendingRow = { id: string; row_index: number }

type DispatchAdminTopicImportDependencies = {
  enqueueContinuation: typeof enqueueAdminTopicImportDispatchContinuation
  enqueueRows: typeof enqueueBulkAdminTopicImportRows
}

const defaultDependencies: DispatchAdminTopicImportDependencies = {
  enqueueContinuation: enqueueAdminTopicImportDispatchContinuation,
  enqueueRows: enqueueBulkAdminTopicImportRows,
}

/**
 * Puts one page of a batch's pending rows on the queue, then continues from the page's last row.
 * Rows that already finished are not pending, so a repeated run enqueues only what is outstanding.
 */
export async function dispatchAdminTopicImport(
  data: { batchId: string; cursor?: number },
  dependencies: Partial<DispatchAdminTopicImportDependencies> = {},
): Promise<void> {
  const { enqueueContinuation, enqueueRows } = { ...defaultDependencies, ...dependencies }
  if (!isUUID(data.batchId)) throw new UnrecoverableError(`Invalid import batch ${data.batchId}`)

  const pageSize = getAdminImportsWorkLimit('dispatch_page_size')
  const pending = await readPendingRows(data.batchId, data.cursor ?? -1, pageSize + 1)
  const page = pending.slice(0, pageSize)
  if (page.length === 0) return

  await enqueueRows(page.map(row => ({ batchId: data.batchId, rowId: row.id })))
  // The cursor advances only once the page is on the queue.
  if (pending.length > pageSize) {
    await enqueueContinuation(data.batchId, page[page.length - 1]!.row_index)
  }
}

async function readPendingRows(
  batchId: string,
  afterRowIndex: number,
  limit: number,
): Promise<PendingRow[]> {
  // The primary, not the replica: the batch was inserted moments ago, and a lagging replica that
  // returned no rows would end the import without a single row ever running.
  const { rows } = await write(
    sql`/* readPendingAdminImportRows */
      SELECT id, row_index
      FROM admin_import_rows
      WHERE batch_id = ${batchId}
        AND row_index > ${afterRowIndex}
        AND completed_at IS NULL
        AND failed_at IS NULL
      ORDER BY row_index
      LIMIT ${limit}
    `,
  )
  return rows as PendingRow[]
}
