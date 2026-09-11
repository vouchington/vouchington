import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { isHttpError } from 'http-errors'
import { isAdminUser } from '@services/users'
import { requireAuthAndRateLimit } from '../../response-helpers.mts'
import { enqueueArticleSync } from '@queues/article-sync/enqueues'
import { articleSync } from '@queues/article-sync/queues'
import { articleSyncPubSub, type ArticleSyncStatus } from '@data-stores/valkey-pubsub'
import { startSSE, pipeChannelToSSE, watchForAbortBeforeSSE } from '../../sse-helpers.mts'
import { apiResponse } from '../../response-contract.mts'

/**
 * POST /api/v1/article-syncs — Enqueue an article sync job.
 * Returns { jobId } for polling. 409 if throttled (recently triggered).
 */
app.route('/api/v1/article-syncs').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(ctx, isAdminUser, 'POST:/api/v1/article-syncs')

  const job = await enqueueArticleSync(currentUser.id)
  if (!job) {
    ctx.throw(409, 'An article sync was already triggered recently')
  }

  ctx.setStatus(202)
  ctx.json({ jobId: job.id })
})

/**
 * GET /api/v1/article-syncs/:jobId — Poll article sync job state.
 */
app.route('/api/v1/article-syncs/:jobId').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, isAdminUser, 'GET:/api/v1/article-syncs/:jobId')

  const job = await articleSync.getJob(ctx.params.jobId!)
  if (!job) {
    ctx.throw(404, 'Sync job not found')
  }

  if (job.failedReason) {
    ctx.json({ status: 'failed', error: job.failedReason })
    return
  }

  if (job.finishedOn != null) {
    ctx.json({ status: 'completed', result: job.returnvalue })
    return
  }

  ctx.json(apiResponse('GET:/api/v1/article-syncs/:jobId#active', { status: 'active' as const }))
})

/**
 * GET /api/v1/admin/article-syncs/:jobId/stream — SSE stream for article sync status.
 */
app.route('/api/v1/admin/article-syncs/:jobId/stream').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, isAdminUser, 'GET:/api/v1/admin/article-syncs/:jobId/stream')

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
      if (isHttpError(err)) throw err
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
    sse = startSSE(ctx)
    await pipeChannelToSSE({
      ctx,
      stream: sse.stream,
      subscription,
      eventName: 'status',
      abortSignal: sse.lifecycleSignal,
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
