import type { PassThrough } from 'node:stream'
import type { ApiSseEvent } from '../../../response-contract.mts'
import type { Context } from '@jongleberry/api-server'
import type { ChannelPubSub } from '@data-stores/valkey-pubsub'
import type { PrivateUser } from '@services/users/types'
import { requireAuthAndRateLimit } from '../../../response-helpers.mts'
import { pipeChannelToSSE, startSSE } from '../../../sse-helpers.mts'

const CHANNEL_KEY = 'snapshot'

type SnapshotPublisher<T> = (value: T) => Promise<void>

type AdminSnapshotStreamOptions<T> = {
  authorize: (user: PrivateUser) => boolean
  rateLimitKey: string
  pubSub: ChannelPubSub<T>
  tickerIntervalMs: number
  publishTick: (publish: SnapshotPublisher<T>) => void
  loadInitialValue: () => Promise<T | undefined>
  emit: (stream: PassThrough, event: ApiSseEvent<'snapshot', T>) => void
}

export function createAdminSnapshotStream<T>(
  options: AdminSnapshotStreamOptions<T>,
): (ctx: Context) => Promise<void> {
  let subscriberCount = 0
  let ticker: ReturnType<typeof setInterval> | null = null

  const publish: SnapshotPublisher<T> = value => options.pubSub.publish(CHANNEL_KEY, value)

  function startTicker(): void {
    ticker = setInterval(() => {
      options.publishTick(publish)
    }, options.tickerIntervalMs)
  }

  function stopTicker(): void {
    if (ticker !== null) {
      clearInterval(ticker)
      ticker = null
    }
  }

  return async (ctx: Context) => {
    await requireAuthAndRateLimit(ctx, options.authorize, options.rateLimitKey)

    // Subscribe BEFORE fetching current state to avoid race conditions.
    const subscription = await options.pubSub.subscribe(CHANNEL_KEY)
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

      let initialValue: T | undefined
      if (!sse.lifecycleSignal.aborted) {
        initialValue = await options.loadInitialValue()
      }

      try {
        await pipeChannelToSSE({
          emit: event => options.emit(sse!.stream, event),
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
  }
}
