import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateUUIDParam } from '../../../response-helpers.mts'
import {
  currentUserCanViewImportBatch,
  getImportBatch,
  getImportBatchProgress,
} from '@services/admin-imports'
import { getRssFeedImport } from '@services/user-import-export/rss-feed-imports'
import {
  subscribeImportProgress,
  type ImportProgressSubscription,
  type ImportProgressChunk,
} from '@data-stores/valkey-pubsub'
import { acquireDuringSSECycle, startSSE } from '../../../sse-helpers.mts'
import {
  pipeImportProgressToSSE,
  pipeUserRssFeedImportProgressToSSE,
  THROTTLE_INTERVAL_MS,
} from './stream-helpers.mts'

// GET /api/v1/imports/:batchId/stream
app.route('/api/v1/imports/:batchId/stream').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/imports/:batchId/stream')
  const batchId = validateUUIDParam(ctx, 'batchId')

  const batch = await getImportBatch(batchId)
  const userRssFeedImport = batch ? null : await getRssFeedImport(currentUser.id, batchId)
  ctx.assert(
    currentUserCanViewImportBatch(currentUser, batch) || userRssFeedImport,
    404,
    'Import not found',
  )

  const { stream, pipelinePromise, lifecycleSignal } = startSSE(ctx)

  let subscription: ImportProgressSubscription | undefined
  let closeSubscription: (() => Promise<void>) | undefined

  try {
    if (!batch) {
      if (lifecycleSignal.aborted) return
      await pipeUserRssFeedImportProgressToSSE({
        batchId,
        userId: currentUser.id,
        initialImport: userRssFeedImport!,
        write: data => stream.write(data),
        disconnectSignal: lifecycleSignal,
      })
      return
    }

    // Subscribe BEFORE reading current progress to avoid race where rows complete in between
    const acquiredSubscription = await acquireDuringSSECycle(lifecycleSignal, () =>
      subscribeImportProgress(batchId),
    )
    if (!acquiredSubscription) return
    subscription = acquiredSubscription.resource
    closeSubscription = acquiredSubscription.close

    const progress = await getImportBatchProgress(batchId)
    if (lifecycleSignal.aborted) return
    // Use the fresh progress snapshot (read AFTER subscribing) to determine done state.
    // batch.completed_at was read before subscribing and may be stale if the batch
    // completed between the ownership check and the subscription being established.
    const initialChunk: ImportProgressChunk = {
      batchId,
      completed: progress.completed,
      failed: progress.failed,
      total: progress.total,
      done: progress.total > 0 && progress.pending === 0,
    }

    stream.write(`event: progress\ndata: ${JSON.stringify(initialChunk)}\n\n`)

    // If already done at snapshot time, emit done and return
    if (initialChunk.done) {
      stream.write(`event: done\ndata: ${JSON.stringify({})}\n\n`)
      return
    }

    await pipeImportProgressToSSE({
      subscription,
      write: data => stream.write(data),
      disconnectSignal: lifecycleSignal,
      throttleIntervalMs: THROTTLE_INTERVAL_MS,
    })
  } finally {
    stream.end()
    await closeSubscription?.()
    await pipelinePromise
  }
})
