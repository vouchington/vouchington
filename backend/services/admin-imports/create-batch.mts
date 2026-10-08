import { getAdminImportsWorkLimit } from '@queues/admin-imports/config'
import { recordModeratorAction } from '@services/moderator-actions'
import { runWithTransaction, write, type TransactionQuery } from '@data-stores/psql'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import sql from 'sql-template-strings'
import type { ImportType, ImportBatch, ImportRow } from './types.mts'

const MAX_ROWS = 50000

type CreateBatchResult = {
  batch: ImportBatch
  rows: ImportRow[]
  rowIds: string[]
}

export async function createImportBatch(
  creator: PrivateUser,
  importType: ImportType,
  inputRows: Record<string, unknown>[],
  metadata?: Record<string, unknown>,
  options: { query?: TransactionQuery } = {},
): Promise<CreateBatchResult> {
  const CHUNK_SIZE = getAdminImportsWorkLimit('insert_chunk_size')
  const totalRows = inputRows.length
  assert(totalRows > 0, 400, 'Batch must have at least one row')
  assert(totalRows <= MAX_ROWS, 400, `Batch must not exceed ${MAX_ROWS} rows`)

  return runWithTransaction(options.query, async query => {
    const { rows: batchRows } = await write(
      sql`/* createImportBatch */
      INSERT INTO admin_import_batches (
        import_type,
        created_by_id,
        total_rows,
        metadata
      )
      VALUES (
        ${importType},
        ${creator.id},
        ${totalRows},
        ${metadata ? JSON.stringify(metadata) : null}
      )
      RETURNING id, import_type, created_by_id, total_rows, completed_rows, failed_rows,
        completed_at, created_at, updated_at, metadata
    `,
      { query },
    )

    const batch = batchRows[0] as ImportBatch

    // Insert rows in chunks to avoid huge single UNNEST calls
    const allRows: ImportRow[] = []
    for (let i = 0; i < inputRows.length; i += CHUNK_SIZE) {
      const chunk = inputRows.slice(i, i + CHUNK_SIZE)
      const chunkIndices = chunk.map((_, j) => i + j)
      // oxlint-disable-next-line no-await-in-loop -- transaction-scoped chunks insert row indexes in deterministic batch order
      const { rows: chunkRows } = await write(
        sql`/* createImportBatch */
        INSERT INTO admin_import_rows (batch_id, row_index, input_data)
        SELECT ${batch.id}, row_index, input_data
        FROM UNNEST(
          ${chunkIndices}::int[],
          ${chunk.map(r => JSON.stringify(r))}::jsonb[]
        ) AS t(row_index, input_data)
        RETURNING id, batch_id, row_index, input_data, NULL::UUID AS created_entity_id,
          completed_at, failed_at, error_message, created_at, updated_at
      `,
        { query },
      )
      allRows.push(...(chunkRows as ImportRow[]))
    }
    const rows = allRows
    const rowIds = rows.map(r => r.id)

    const result = { batch, rows, rowIds }

    await recordModeratorAction(
      creator.id,
      {
        actionType: 'import_batch_create',
        adminImportBatchId: batch.id,
        metadata: { after: { import_type: importType, total_rows: totalRows } },
      },
      { query },
    )
    return result
  })
}
