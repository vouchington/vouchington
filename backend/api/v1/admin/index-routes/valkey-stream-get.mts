import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { currentUserCanAccessValkeyAdmin } from '@services/valkey-admin/authorization'
import { getCacheGroups } from '@services/valkey-admin/clear-cache'
import { requireAuthAndRateLimit } from '../../../response-helpers.mts'
import { createChannelPubSub } from '@data-stores/valkey-pubsub'
import { startSSE, pipeChannelToSSE } from '../../../sse-helpers.mts'
import onError from '@modules/on-error'

const TICKER_INTERVAL_MS = 10_000
const CHANNEL_KEY = 'snapshot'

const valkeyPubSub = createChannelPubSub('admin:valkey')

let subscriberCount = 0
let ticker: ReturnType<typeof setInterval> | null = null

async function fetchSnapshot() {
  const cacheGroupsResult = await Promise.allSettled([getCacheGroups()]).then(([result]) => result)
  const errors: { groups?: string } = {}
  if (cacheGroupsResult.status === 'rejected') {
    errors.groups =
      cacheGroupsResult.reason instanceof Error
        ? cacheGroupsResult.reason.message
        : 'Failed to load cache groups'
  }
  return {
    groups: cacheGroupsResult.status === 'fulfilled' ? cacheGroupsResult.value : null,
    ...(Object.keys(errors).length > 0 ? { errors } : {}),
  }
}

function startTicker() {
  ticker = setInterval(() => {
    fetchSnapshot()
      .then(snapshot => valkeyPubSub.publish(CHANNEL_KEY, snapshot))
      .catch(onError)
  }, TICKER_INTERVAL_MS)
}

function stopTicker() {
  if (ticker !== null) {
    clearInterval(ticker)
    ticker = null
  }
}

app.route('/api/v1/admin/valkey/stream').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanAccessValkeyAdmin,
    'GET:/api/v1/admin/valkey/stream',
  )

  // Subscribe BEFORE fetching current state to avoid race conditions.
  const subscription = await valkeyPubSub.subscribe(CHANNEL_KEY)
  subscriberCount++
  if (subscriberCount === 1) startTicker()

  let subscriptionClosed = false
  let closeSubscriptionPromise: Promise<void> | undefined
  const closeSubscription = () => {
    if (subscriptionClosed) return
    subscriptionClosed = true
    closeSubscriptionPromise = Promise.resolve(subscription.close())
    subscriberCount--
    if (subscriberCount === 0) stopTicker()
  }

  let sse: ReturnType<typeof startSSE> | undefined
  try {
    sse = startSSE(ctx)
    if (sse.lifecycleSignal.aborted) closeSubscription()
    else sse.lifecycleSignal.addEventListener('abort', closeSubscription, { once: true })

    let initialValue: unknown
    if (!sse.lifecycleSignal.aborted) {
      initialValue = await fetchSnapshot()
    }

    try {
      await pipeChannelToSSE({
        ctx,
        stream: sse.stream,
        subscription,
        eventName: 'snapshot',
        abortSignal: sse.lifecycleSignal,
        initialValue,
      })
    } finally {
      sse.stream.end()
      await sse.pipelinePromise
    }
  } finally {
    sse?.lifecycleSignal.removeEventListener('abort', closeSubscription)
    closeSubscription()
    await closeSubscriptionPromise
  }
})
