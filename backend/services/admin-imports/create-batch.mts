import { beginTransaction, write } from '@data-stores/psql'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import sql from 'sql-template-strings'
import {
  batchFromStored,
  importBatchMetadata,
  importRowFromStored,
  rssFeedColumns,
  topicColumns,
  TOPIC_IMPORT_FIELDS,
  type StoredImportBatch,
} from './input-rows.mts'
import type { ImportBatch, ImportBatchMetadata, ImportType, ImportRow } from './types.mts'

const MAX_ROWS = 50000
const CHUNK_SIZE = 1000

type CreateBatchResult = {
  batch: ImportBatch
  rows: ImportRow[]
  rowIds: string[]
}

export async function createImportBatch(
  creator: PrivateUser,
  importType: ImportType,
  inputRows: Record<string, unknown>[],
  metadata?: ImportBatchMetadata,
): Promise<CreateBatchResult> {
  const totalRows = inputRows.length
  assert(totalRows > 0, 400, 'Batch must have at least one row')
  assert(totalRows <= MAX_ROWS, 400, `Batch must not exceed ${MAX_ROWS} rows`)
  const batchMetadata = importBatchMetadata(metadata)
  const prepared =
    importType === 'topic' ? inputRows.map(topicColumns) : inputRows.map(rssFeedColumns)

  await using query = await beginTransaction()

  const { rows: batchRows } = await write(
    sql`/* createImportBatch */
      INSERT INTO admin_import_batches (
        import_type,
        created_by_id,
        total_rows,
        metadata_source,
        metadata_version
      )
      VALUES (
        ${importType},
        ${creator.id},
        ${totalRows},
        ${batchMetadata.source},
        ${batchMetadata.version}
      )
      RETURNING *
    `,
    { query },
  )

  const batch = batchFromStored(batchRows[0] as StoredImportBatch)

  const allRows: ImportRow[] = []
  for (let i = 0; i < inputRows.length; i += CHUNK_SIZE) {
    const chunk = inputRows.slice(i, i + CHUNK_SIZE)
    const chunkPrepared = prepared.slice(i, i + CHUNK_SIZE)
    const chunkIndices = chunk.map((_, j) => i + j)
    // oxlint-disable-next-line no-await-in-loop -- transaction-scoped chunks insert row indexes in deterministic batch order
    const { rows: chunkRows } = await write(
      sql`/* createImportBatch */
        INSERT INTO admin_import_rows (batch_id, row_index)
        SELECT ${batch.id}, row_index
        FROM UNNEST(${chunkIndices}::int[]) AS t(row_index)
        ORDER BY row_index
        RETURNING *, NULL::UUID AS created_entity_id
      `,
      { query },
    )
    const storedRows = chunkRows as ImportRow[]
    // oxlint-disable-next-line no-await-in-loop -- child input rows are inserted in the same transaction chunk
    await insertImportInputs(query, importType, storedRows, chunkPrepared)
    allRows.push(
      ...storedRows.map((row, index) => importRowFromStored({ ...row, input_data: chunk[index]! })),
    )
  }
  const rows = allRows
  const rowIds = rows.map(r => r.id)

  const result = { batch, rows, rowIds }

  await query.commit()
  return result
}

async function insertImportInputs(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  importType: ImportType,
  rows: ImportRow[],
  prepared: Array<ReturnType<typeof topicColumns> | ReturnType<typeof rssFeedColumns>>,
): Promise<void> {
  const rowIds = rows.map(row => row.id)
  if (importType === 'rss_feed') {
    const inputs = prepared as Array<ReturnType<typeof rssFeedColumns>>
    await write(
      sql`/* createImportBatch:rssFeedInput */
        INSERT INTO admin_import_rss_feed_rows (admin_import_row_id, url, follow)
        SELECT admin_import_row_id, url, follow
        FROM UNNEST(
          ${rowIds}::uuid[],
          ${inputs.map(input => input.url)}::text[],
          ${inputs.map(input => input.follow)}::boolean[]
        ) AS input(admin_import_row_id, url, follow)
        ORDER BY admin_import_row_id
      `,
      { query },
    )
    return
  }

  const inputs = prepared as Array<ReturnType<typeof topicColumns>>
  await write(
    `/* createImportBatch:topicInput */
      INSERT INTO admin_import_topic_rows (
        admin_import_row_id,
        ${TOPIC_IMPORT_FIELDS.join(', ')}
      )
      SELECT *
      FROM UNNEST(
        $1::uuid[],
        ${TOPIC_IMPORT_FIELDS.map((_, index) => `$${index + 2}::text[]`).join(', ')}
      ) AS input(
        admin_import_row_id,
        ${TOPIC_IMPORT_FIELDS.join(', ')}
      )
      ORDER BY admin_import_row_id
    `,
    [rowIds, ...TOPIC_IMPORT_FIELDS.map(field => inputs.map(input => input[field]))],
    { query },
  )
}
