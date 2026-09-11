import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import {
  getPrivateUserByIdOrSlug,
  currentUserCanAccessDataRequest,
  assertNotSuspended,
} from '@services/users'
import {
  createDataRequestOrConflict,
  getDataRequestById,
  getLatestDataRequest,
  getExportDownloadUrl,
  type UserDataRequest,
} from '@services/account-data-requests'
import { enqueueExportRequest } from '@queues/account-data-requests/enqueues'
import { dataRequestPubSub, type DataRequestStatus } from '@data-stores/valkey-pubsub'
import { startSSE, pipeChannelToSSE, watchForAbortBeforeSSE } from '../../sse-helpers.mts'

const ACTIVE_EXPORT_CONFLICT_ERROR = 'A data export is already in progress'

function activeRequestConflict(existing: UserDataRequest | null) {
  if (!existing) {
    return { error: ACTIVE_EXPORT_CONFLICT_ERROR }
  }

  return {
    error: ACTIVE_EXPORT_CONFLICT_ERROR,
    id: existing.id,
    status: existing.status,
    created_at: existing.created_at,
    expires_at: existing.expires_at ?? null,
  }
}

app.route('/api/v1/users/:idOrSlug/data-request').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/users/:idOrSlug/data-request')
  assertNotSuspended(currentUser)

  const user = await getPrivateUserByIdOrSlug(ctx.params.idOrSlug!)
  ctx.assert(user, 404, 'User not found')
  ctx.assert(currentUserCanAccessDataRequest(currentUser, user.id), 403, 'Forbidden')

  const createResult = await createDataRequestOrConflict(user.id)
  if (createResult.type === 'conflict') {
    ctx.setStatus(409)
    ctx.json(activeRequestConflict(createResult.existing))
    return
  }

  const { request } = createResult
  await enqueueExportRequest(request.id, user.id, request.processing_attempt_id)

  ctx.setStatus(201)
  ctx.json({
    id: request.id,
    status: request.status,
    created_at: request.created_at,
    expires_at: request.expires_at ?? null,
  })
})

app.route('/api/v1/users/:idOrSlug/data-request').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/users/:idOrSlug/data-request')

  const user = await getPrivateUserByIdOrSlug(ctx.params.idOrSlug!)
  ctx.assert(user, 404, 'User not found')
  ctx.assert(currentUserCanAccessDataRequest(currentUser, user.id), 403, 'Forbidden')

  const request = await getLatestDataRequest(user.id)
  ctx.assert(request, 404, 'No data request found')

  const expiresAt = request.expires_at ? new Date(request.expires_at) : null
  const isReady = request.status === 'ready' && expiresAt && expiresAt > new Date()

  let downloadUrl: string | null = null
  if (isReady && request.s3_key) {
    downloadUrl = await getExportDownloadUrl(request.s3_key)
  }

  ctx.json({
    id: request.id,
    status: request.status,
    expires_at: request.expires_at,
    created_at: request.created_at,
    download_url: downloadUrl,
  })
})

app.route('/api/v1/users/:idOrSlug/data-request/stream').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/users/:idOrSlug/data-request/stream')

  const user = await getPrivateUserByIdOrSlug(ctx.params.idOrSlug!)
  ctx.assert(user, 404, 'User not found')
  ctx.assert(currentUserCanAccessDataRequest(currentUser, user.id), 403, 'Forbidden')

  // First read to obtain the request ID used to address the pub/sub channel.
  const requestIdParam = typeof ctx.query.request_id === 'string' ? ctx.query.request_id : undefined
  const requestRef = requestIdParam
    ? await getDataRequestById(user.id, requestIdParam)
    : await getLatestDataRequest(user.id)
  ctx.assert(requestRef, 404, 'No data request found')

  // Subscribe BEFORE re-reading the current status so no terminal publish is missed.
  const subscription = await dataRequestPubSub.subscribe(requestRef.id)
  let subscriptionClosed = false
  let closeSubscriptionPromise: Promise<void> | undefined
  function closeSubscription() {
    if (subscriptionClosed) return
    subscriptionClosed = true
    closeSubscriptionPromise = Promise.resolve(subscription.close())
  }
  const abortBeforeSSE = watchForAbortBeforeSSE(ctx.signal, closeSubscription)
  try {
    // Re-read after subscribing so we see any status change that occurred between
    // the first read and the subscribe call (worker may have finished in that window).
    const request = (await getDataRequestById(user.id, requestRef.id)) ?? requestRef

    let initialValue: DataRequestStatus | undefined
    const isTerminalStatus = (s: string) => s === 'ready' || s === 'failed' || s === 'expired'

    if (isTerminalStatus(request.status)) {
      let downloadUrl: string | null = null
      if (request.status === 'ready' && request.s3_key) {
        downloadUrl = await getExportDownloadUrl(request.s3_key).catch(() => null)
      }
      initialValue = { status: request.status, download_url: downloadUrl }
    }
    /* v8 ignore next 2 -- socket abort timing is covered deterministically by watchForAbortBeforeSSE tests */
    if (abortBeforeSSE.wasAborted()) return
    abortBeforeSSE.stop()
    const { stream, pipelinePromise, lifecycleSignal } = startSSE(ctx)
    try {
      await pipeChannelToSSE({
        ctx,
        stream,
        subscription,
        eventName: 'status',
        abortSignal: lifecycleSignal,
        isTerminal: (s: DataRequestStatus) => isTerminalStatus(s.status),
        initialValue,
      })
    } finally {
      stream.end()
      await pipelinePromise
    }
  } finally {
    abortBeforeSSE.stop()
    closeSubscription()
    await closeSubscriptionPromise
  }
})
