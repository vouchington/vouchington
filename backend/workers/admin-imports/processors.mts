import {
  getImportRowWithBatch,
  processTopicRow,
  updateRowCompleted,
  updateRowFailed,
} from '@services/admin-imports'
import { getPrivateUserByAny } from '@services/users'
import onError from '@modules/on-error'
import { UnrecoverableError } from '@vouchington/queue-errors'
import { publishImportProgress } from '@data-stores/valkey-pubsub'
import createHttpError from 'http-errors'

export async function processImportRow(
  batchId: string,
  rowId: string,
  options: { isFinalAttempt?: boolean } = {},
): Promise<void> {
  const { isFinalAttempt = true } = options
  const result = await getImportRowWithBatch(rowId)

  if (!result) {
    const err = createHttpError(500, `Import row ${rowId} not found`, {
      extra: { batchId, rowId },
    })
    onError(err)
    return
  }

  const { batch, row } = result

  // Validate that this row belongs to the expected batch.
  if (batch.id !== batchId) {
    const err = new Error(
      `Import row ${rowId} belongs to batch ${batch.id}, not ${batchId}`,
    ) as Error & {
      extra: { batchId: string; rowId: string; actualBatchId: string }
    }
    err.extra = { batchId, rowId, actualBatchId: batch.id }
    onError(err)
    return
  }

  // Idempotency: skip rows that have already completed successfully.
  // Do NOT skip failed rows — allow retries to re-attempt them.
  if (row.completed_at) return

  const admin = await getPrivateUserByAny(batch.created_by_id)
  if (!admin) {
    // Creator gone — permanent failure (no retry since we return without throwing).
    const failProgress = await updateRowFailed(rowId, 'Import batch creator not found', {
      isFinalAttempt: true,
    })
    if (failProgress) {
      void publishImportProgress(failProgress.batchId, failProgress).catch(onError)
    }
    return
  }

  try {
    if (batch.import_type !== 'topic') throw new Error(`Unknown import_type: ${batch.import_type}`)
    const createdEntityId = await processTopicRow(admin, row)

    const progress = await updateRowCompleted(rowId, createdEntityId)
    void publishImportProgress(progress.batchId, progress).catch(onError)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // UnrecoverableErrors (e.g. URL validation) never succeed on retry — treat as final
    // regardless of isFinalAttempt so the row and batch are marked complete immediately.
    const isFinalFailure = isFinalAttempt || err instanceof UnrecoverableError
    const failProgress = await updateRowFailed(rowId, message, {
      isFinalAttempt: isFinalFailure,
    })
    if (failProgress) {
      void publishImportProgress(failProgress.batchId, failProgress).catch(onError)
    }
    throw err // Let glide-mq handle retries
  }
}
