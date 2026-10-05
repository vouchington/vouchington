import {
  startAdminArticleSync,
  getAdminArticleSyncStatus,
} from '@services/admin-imports/article-sync-controls'
import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { isAdminUser } from '@services/users'
import {
  requireAuthAndRateLimit,
  rethrowHttpError,
  validateRequestContract,
} from '../../response-helpers.mts'
import { articleSync } from '@queues/article-sync/queues'
import { articleSyncPubSub, type ArticleSyncStatus } from '@data-stores/valkey-pubsub'
import { startSSE, pipeChannelToSSE, watchForAbortBeforeSSE } from '../../sse-helpers.mts'
import { apiResponse, apiSseFrame } from '../../response-contract.mts'

/**
 * POST /api/v1/article-syncs — Enqueue an article sync job.
 * Returns { jobId } for polling. 409 if throttled (recently triggered).
 */
app.route('/api/v1/article-syncs').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(ctx, isAdminUser, 'POST:/api/v1/article-syncs')

  const result = await startAdminArticleSync(currentUser)
  ctx.setStatus(202)
  ctx.json(result)
})

/**
 * GET /api/v1/article-syncs/:jobId — Poll article sync job state.
 */
app.route('/api/v1/article-syncs/:jobId').get(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    isAdminUser,
    'GET:/api/v1/article-syncs/:jobId',
  )
  validateRequestContract(ctx, 'GET:/api/v1/article-syncs/:jobId', { path: ctx.params })
  const result = await getAdminArticleSyncStatus(currentUser, ctx.params.jobId!)
  ctx.json(
    result.status === 'active'
      ? apiResponse('GET:/api/v1/article-syncs/:jobId#active', result)
      : result,
  )
})

/**
 * GET /api/v1/admin/article-syncs/:jobId/stream — SSE stream for article sync status.
 */
app.route('/api/v1/admin/article-syncs/:jobId/stream').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, isAdminUser, 'GET:/api/v1/admin/article-syncs/:jobId/stream')

  validateRequestContract(ctx, 'GET:/api/v1/admin/article-syncs/:jobId/stream', {
    path: ctx.params,
  })
  const jobId = ctx.params.jobId!

  // Subscribe BEFORE checking current job state to avoid race conditions.
  const subscription = await articleSyncPubSub.subscribe(jobId)

  let initialValue: ArticleSyncStatus | undefined
  let sse: ReturnType<typeof startSSE> | undefined
  let subscriptionClosed = false
  let closeSubscriptionPromise: Promise<void> | undefined
  function closeSubscription() {
    if (subscriptionClosed) return
    subscriptionClosed = true
    closeSubscriptionPromise = Promise.resolve(subscription.close())
  }
  const abortBeforeSSE = watchForAbortBeforeSSE(ctx.signal, closeSubscription)
  try {
    let job: Awaited<ReturnType<typeof articleSync.getJob>>
    try {
      job = await articleSync.getJob(jobId)
    } catch (err) {
      rethrowHttpError(err)
      ctx.throw(503, 'Failed to load sync status')
    }
    if (!job) {
      ctx.throw(404, 'Sync job not found')
    }
    if (job.failedReason) {
      initialValue = { status: 'failed', error: job.failedReason }
    } else if (job.finishedOn != null) {
      initialValue = { status: 'completed', result: job.returnvalue }
    }

    /* v8 ignore next 2 -- socket abort timing is covered deterministically by watchForAbortBeforeSSE tests */
    if (abortBeforeSSE.wasAborted()) return
    /* v8 ignore next -- successful article streams require live queue timing; watcher stop is unit-tested */
    abortBeforeSSE.stop()
    const started = startSSE(ctx)
    sse = started
    const stream = started.stream
    await pipeChannelToSSE({
      emit: event =>
        stream.write(apiSseFrame('GET:/api/v1/admin/article-syncs/:jobId/stream', event)),
      subscription,
      eventName: 'status',
      abortSignal: started.lifecycleSignal,
      isTerminal: (s: ArticleSyncStatus) => s.status === 'completed' || s.status === 'failed',
      initialValue,
    })
  } finally {
    abortBeforeSSE.stop()
    closeSubscription()
    sse?.stream.end()
    await closeSubscriptionPromise
    await sse?.pipelinePromise
  }
})
