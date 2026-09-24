import {
  getImportRowWithBatch,
  processRssFeedRow,
  processTopicRow,
  updateRowCompleted,
  updateRowFailed,
} from '@services/admin-imports'
import { getPrivateUserByAny } from '@services/users'
import onError from '@modules/on-error'
import { UnrecoverableError } from '@modules/queue-errors'
import { publishImportProgress } from '@data-stores/valkey-pubsub'
import createHttpError from 'http-errors'

type AdminImportProcessorDependencies = {
  getImportRowWithBatch: typeof getImportRowWithBatch
  getPrivateUserByAny: typeof getPrivateUserByAny
  processRssFeedRow: typeof processRssFeedRow
  processTopicRow: typeof processTopicRow
  publishImportProgress: typeof publishImportProgress
  updateRowCompleted: typeof updateRowCompleted
  updateRowFailed: typeof updateRowFailed
}

export async function processImportRow(
  batchId: string,
  rowId: string,
  options: { isFinalAttempt?: boolean } = {},
  dependencies?: Partial<AdminImportProcessorDependencies>,
): Promise<void> {
  const { isFinalAttempt = true } = options
  const deps = {
    getImportRowWithBatch,
    getPrivateUserByAny,
    processRssFeedRow,
    processTopicRow,
    publishImportProgress,
    updateRowCompleted,
    updateRowFailed,
    ...dependencies,
  }
  const result = await deps.getImportRowWithBatch(rowId)

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

  const admin = await deps.getPrivateUserByAny(batch.created_by_id)
  if (!admin) {
    // Creator gone — permanent failure (no retry since we return without throwing).
    const failProgress = await deps.updateRowFailed(rowId, 'Import batch creator not found', {
      isFinalAttempt: true,
    })
    if (failProgress) {
      void deps.publishImportProgress(failProgress.batchId, failProgress).catch(onError)
    }
    return
  }

  try {
    let createdEntityId: string

    switch (batch.import_type) {
      case 'topic':
        createdEntityId = await deps.processTopicRow(admin, row)
        break
      case 'rss_feed':
        createdEntityId = await deps.processRssFeedRow(admin, row)
        break
      default:
        throw new Error(`Unknown import_type: ${batch.import_type}`)
    }

    const progress = await deps.updateRowCompleted(rowId, createdEntityId)
    void deps.publishImportProgress(progress.batchId, progress).catch(onError)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // UnrecoverableErrors (e.g. URL validation) never succeed on retry — treat as final
    // regardless of isFinalAttempt so the row and batch are marked complete immediately.
    const isFinalFailure = isFinalAttempt || error instanceof UnrecoverableError
    const failProgress = await deps.updateRowFailed(rowId, message, {
      isFinalAttempt: isFinalFailure,
    })
    if (failProgress) {
      void deps.publishImportProgress(failProgress.batchId, failProgress).catch(onError)
    }
    throw error // Let glide-mq handle retries
  }
}
