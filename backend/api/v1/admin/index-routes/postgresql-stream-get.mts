import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { currentUserCanAccessPsqlAdmin } from '@services/psql-admin/authorization'
import { getMigrationStatus } from '@services/psql-admin'
import { requireAuthAndRateLimit } from '../../../response-helpers.mts'
import { createChannelPubSub } from '@data-stores/valkey-pubsub'
import { startSSE, pipeChannelToSSE } from '../../../sse-helpers.mts'
import onError from '@modules/on-error'

const TICKER_INTERVAL_MS = 30_000
const CHANNEL_KEY = 'snapshot'

const postgresqlPubSub = createChannelPubSub('admin:postgresql')

let subscriberCount = 0
let ticker: ReturnType<typeof setInterval> | null = null

function startTicker() {
  ticker = setInterval(() => {
    getMigrationStatus()
      .then(snapshot => postgresqlPubSub.publish(CHANNEL_KEY, snapshot))
      .catch(err => {
        const error = err instanceof Error ? err.message : 'Failed to load PostgreSQL status'
        void postgresqlPubSub.publish(CHANNEL_KEY, { error }).catch(onError)
        onError(err instanceof Error ? err : new Error(String(err)))
      })
  }, TICKER_INTERVAL_MS)
}

function stopTicker() {
  if (ticker !== null) {
    clearInterval(ticker)
    ticker = null
  }
}

app.route('/api/v1/admin/postgresql/stream').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanAccessPsqlAdmin,
    'GET:/api/v1/admin/postgresql/stream',
  )

  // Subscribe BEFORE fetching current state to avoid race conditions.
  const subscription = await postgresqlPubSub.subscribe(CHANNEL_KEY)
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
      try {
        initialValue = await getMigrationStatus()
      } catch (err) /* v8 ignore next 2 -- exercising recovery requires a forbidden internal service failure mock */ {
        onError(err instanceof Error ? err : new Error(String(err)))
      }
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
