import assert from 'http-assert'
import { parseCsvRows } from '@modules/csv'
import onError from '@modules/on-error'
import { enqueueAdminTopicImportDispatch } from '@queues/admin-imports/enqueues'
import { assertNotSuspended, isAdminUser } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import { createImportBatch } from './create-batch.mts'
import { validateTopicHeaders, validateTopicRows } from './validate-topics.mts'
import type { BatchValidationResult, ImportBatch } from './types.mts'

type TopicImportResult =
  | { valid: false; error: string }
  | { valid: false; validation: BatchValidationResult }
  | { valid: true; batch: Pick<ImportBatch, 'id' | 'import_type' | 'total_rows' | 'created_at'> }

export async function importAdminTopics(
  currentUser: PrivateUser,
  csv: string,
): Promise<TopicImportResult> {
  assert(isAdminUser(currentUser), 403, 'Administrator role required')
  assertNotSuspended(currentUser)
  assert(typeof csv === 'string', 400, 'csv must be a string')
  assert(Buffer.byteLength(JSON.stringify({ csv })) <= 4 * 1024 * 1024, 413, 'CSV body too large')
  assert(csv.trim().length > 0, 400, 'CSV body must not be empty')
  let rows: Record<string, string>[]
  try {
    rows = parseCsvRows(csv)
  } catch {
    assert(false, 400, 'Invalid CSV format')
  }
  assert(rows.length > 0, 400, 'CSV must contain at least one data row')
  assert(rows.length <= 1000, 400, 'CSV must not exceed 1000 rows')
  const unknownColumns = validateTopicHeaders(Object.keys(rows[0]!))
  if (unknownColumns.length > 0) {
    return { valid: false as const, error: `Unknown CSV columns: ${unknownColumns.join(', ')}` }
  }
  const validation = validateTopicRows(rows)
  if (!validation.valid) return { valid: false as const, validation }
  const { batch } = await createImportBatch(currentUser, 'topic', rows)
  // The batch is committed, so a failed enqueue is reported and the recovery sweep dispatches it;
  // the caller gets the batch instead of an error that would invite a duplicate submission.
  await enqueueAdminTopicImportDispatch(batch.id).catch(onError)
  return {
    valid: true as const,
    batch: {
      id: batch.id,
      import_type: batch.import_type,
      total_rows: batch.total_rows,
      created_at: batch.created_at,
    },
  }
}
