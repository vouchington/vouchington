import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateUUIDParam } from '../../../response-helpers.mts'
import { getImageUploadState, type ImageUploadState } from '@services/images/get-upload-state'
import { imageStatePubSub } from '@data-stores/valkey-pubsub'
import { startSSE, pipeChannelToSSE, watchForAbortBeforeSSE } from '../../../sse-helpers.mts'

function isTerminalImageState(state: ImageUploadState): boolean {
  return state.ready || state.blocked || state.upload_status === 'failed'
}

app.route('/api/v1/images/:id/state/stream').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/images/:id/state/stream')

  const imageId = validateUUIDParam(ctx, 'id')

  // Subscribe BEFORE reading current state to avoid race conditions.
  const subscription = await imageStatePubSub.subscribe(imageId)

  let currentState: ImageUploadState
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
    currentState = await getImageUploadState(currentUser.id, imageId)
    /* v8 ignore next 2 -- socket abort timing is covered deterministically by watchForAbortBeforeSSE tests */
    if (abortBeforeSSE.wasAborted()) return
    abortBeforeSSE.stop()
    sse = startSSE(ctx)
    await pipeChannelToSSE({
      ctx,
      stream: sse.stream,
      subscription,
      eventName: 'state',
      abortSignal: sse.lifecycleSignal,
      isTerminal: isTerminalImageState,
      initialValue: currentState,
    })
  } finally {
    abortBeforeSSE.stop()
    closeSubscription()
    sse?.stream.end()
    await closeSubscriptionPromise
    await sse?.pipelinePromise
  }
})
