import { apiSseFrame } from '../../response-contract.mts'
import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { isUUID } from '@modules/utils'
import {
  requireAuth,
  requireAuthForSuspendedException,
  validateRequestContract,
} from '../../response-helpers.mts'
import { assertNotSuspended } from '@services/users/suspension-guard'
import { getPrivateUserByIdOrSlug, currentUserCanAccessDataRequest } from '@services/users'
import {
  createDataRequestOrConflict,
  getDataRequestById,
  getLatestDataRequest,
  getExportDownloadUrl,
  type UserDataRequest,
} from '@services/account-data-requests'
import { enqueueExportRequest } from '@queues/account-lifecycle/enqueues/account-data-requests'
import {
  dataRequestPubSub,
  type ChannelSubscription,
  type DataRequestStreamStatus,
} from '@data-stores/valkey-pubsub'
import { startSSE, pipeChannelToSSE, watchForAbortBeforeSSE } from '../../sse-helpers.mts'

// An administrator can run an export for any account through the subject's own route (for example
// a legal-process hold). Every read below is scoped to `currentUser`, so the account holder never
// sees, downloads or is told about an export they did not request.
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
  const currentUser = await requireAuthForSuspendedException(
    ctx,
    'POST:/api/v1/users/:idOrSlug/data-request',
  )
  validateRequestContract(ctx, 'POST:/api/v1/users/:idOrSlug/data-request', { path: ctx.params })

  const idOrSlug = ctx.params.idOrSlug!
  const isSelf =
    currentUser.id.toLowerCase() === idOrSlug.toLowerCase() ||
    currentUser.username?.toLowerCase() === idOrSlug.toLowerCase()
  const user = isSelf ? currentUser : await getPrivateUserByIdOrSlug(idOrSlug)
  ctx.assert(user, 404, 'User not found')
  if (currentUser.id !== user.id) assertNotSuspended(currentUser)
  ctx.assert(currentUserCanAccessDataRequest(currentUser, user.id), 403, 'Forbidden')

  const createResult = await createDataRequestOrConflict(user.id, currentUser.id)
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
  validateRequestContract(ctx, 'GET:/api/v1/users/:idOrSlug/data-request', { path: ctx.params })

  const idOrSlug = ctx.params.idOrSlug!
  const isSelf =
    currentUser.id.toLowerCase() === idOrSlug.toLowerCase() ||
    currentUser.username?.toLowerCase() === idOrSlug.toLowerCase()
  const user = isSelf ? currentUser : await getPrivateUserByIdOrSlug(idOrSlug)
  ctx.assert(user, 404, 'User not found')
  ctx.assert(currentUserCanAccessDataRequest(currentUser, user.id), 403, 'Forbidden')

  const request = await getLatestDataRequest(user.id, currentUser.id)
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
  validateRequestContract(ctx, 'GET:/api/v1/users/:idOrSlug/data-request/stream', {
    path: ctx.params,
  })

  const idOrSlug = ctx.params.idOrSlug!
  const isSelf =
    currentUser.id.toLowerCase() === idOrSlug.toLowerCase() ||
    currentUser.username?.toLowerCase() === idOrSlug.toLowerCase()
  const user = isSelf ? currentUser : await getPrivateUserByIdOrSlug(idOrSlug)
  ctx.assert(user, 404, 'User not found')
  ctx.assert(currentUserCanAccessDataRequest(currentUser, user.id), 403, 'Forbidden')

  const requestIdParam = typeof ctx.query.request_id === 'string' ? ctx.query.request_id : undefined
  // SSE routes have no response-route registration, so `apiQuery` cannot declare this key; assert
  // the UUID shape here so a malformed id is a 422 instead of a database 500.
  ctx.assert(!requestIdParam || isUUID(requestIdParam), 422, 'Invalid request ID')

  let subscription: ChannelSubscription<DataRequestStreamStatus> | undefined
  let subscriptionClosed = false
  let closeSubscriptionPromise: Promise<void> | undefined
  function closeSubscription() {
    if (!subscription || subscriptionClosed) return
    subscriptionClosed = true
    closeSubscriptionPromise = Promise.resolve(subscription.close())
  }
  const abortBeforeSSE = watchForAbortBeforeSSE(ctx.signal, closeSubscription)
  try {
    let request: UserDataRequest
    if (requestIdParam) {
      // Subscribe BEFORE the one read: a completion is caught by either the read or the
      // subscription, so no second read is needed. The read stays ahead of the SSE response, so a
      // missing or not-visible request is still a 404 (the finally below closes the subscription).
      subscription = await dataRequestPubSub.subscribe(requestIdParam)
      const found = await getDataRequestById(user.id, currentUser.id, requestIdParam)
      ctx.assert(found, 404, 'No data request found')
      request = found
    } else {
      // The latest id is unknown until read, so subscribe after it and re-read the row by id to
      // catch a worker that finished in between. These are different statements, not a repeat.
      const latest = await getLatestDataRequest(user.id, currentUser.id)
      ctx.assert(latest, 404, 'No data request found')
      subscription = await dataRequestPubSub.subscribe(latest.id)
      request = (await getDataRequestById(user.id, currentUser.id, latest.id)) ?? latest
    }

    let initialValue: DataRequestStreamStatus | undefined
    const isTerminalStatus = (s: string) => s === 'ready' || s === 'failed' || s === 'expired'

    if (isTerminalStatus(request.status)) {
      let downloadUrl: string | null = null
      if (request.status === 'ready' && request.s3_key) {
        downloadUrl = await getExportDownloadUrl(request.s3_key).catch(() => null)
      }
      initialValue = { status: request.status, download_url: downloadUrl }
    }
    if (abortBeforeSSE.wasAborted()) return
    abortBeforeSSE.stop()
    const { stream, pipelinePromise, lifecycleSignal } = startSSE(ctx)
    try {
      await pipeChannelToSSE({
        emit: event =>
          stream.write(apiSseFrame('GET:/api/v1/users/:idOrSlug/data-request/stream', event)),
        subscription,
        eventName: 'status',
        abortSignal: lifecycleSignal,
        isTerminal: (s: DataRequestStreamStatus) => isTerminalStatus(s.status),
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
