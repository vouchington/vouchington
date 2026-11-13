import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { type ChannelPubSub, createChannelPubSub } from '../channel-pubsub.mts'

const channelPrefix = 'test:valkey:channel-pubsub'

describe('createChannelPubSub', () => {
  let cleanup: Array<() => void | Promise<void>> = []
  let closePubSub: (() => Promise<void>) | null = null

  // Owner close() releases the publisher and subscriber clients; closeSubscriber() alone leaves
  // the publisher's Glide socket open for the rest of the fork.
  afterEach(async () => {
    for (const fn of cleanup.toReversed()) {
      await fn()
    }
    cleanup = []
    await closePubSub?.()
    closePubSub = null
  })

  function own<T>(pubSub: ChannelPubSub<T>): ChannelPubSub<T> {
    closePubSub = () => pubSub.close()
    return pubSub
  }

  function trackClose<T extends { close(): void | Promise<void> }>(subscription: T): T {
    cleanup.push(() => subscription.close())
    return subscription
  }

  it('publishes and receives JSON payloads', async () => {
    const pubSub = own(createChannelPubSub<{ x: number }>(channelPrefix))

    const key = randomUUID()
    const sub = trackClose(await pubSub.subscribe(key))
    const received = nextMessage<{ x: number }>(sub.setHandler)
    await pubSub.publish(key, { x: 42 })
    await expect(received).resolves.toEqual({ x: 42 })
  })

  it('replays buffered messages after a handler is installed', async () => {
    const pubSub = own(createChannelPubSub<{ x: string }>(channelPrefix))

    const key = randomUUID()
    const sub = trackClose(await pubSub.subscribe(key))
    const ready = nextMessage<{ x: string }>(sub.setHandler)
    await pubSub.publish(key, { x: 'ready' })
    await expect(ready).resolves.toEqual({ x: 'ready' })
    sub.setHandler(null)

    const probe = trackClose(await pubSub.subscribe(key))
    const seen = nextMessage<{ x: string }>(probe.setHandler)
    await pubSub.publish(key, { x: 'buffered' })
    await seen

    const received: Array<{ x: string }> = []
    sub.setHandler(value => {
      received.push(value)
    })
    expect(received).toEqual([{ x: 'buffered' }])
  })

  it('supports custom serializers and deserializers', async () => {
    const pubSub = own(
      createChannelPubSub<number>(channelPrefix, {
        serialize: value => `value:${value}`,
        deserialize: payload => Number(payload.slice(6)),
      }),
    )

    const key = randomUUID()
    const sub = trackClose(await pubSub.subscribe(key))
    const received = nextMessage<number>(sub.setHandler)
    await pubSub.publish(key, 99)
    await expect(received).resolves.toEqual(99)
  })

  it('delivers a message to every active subscription for the same key', async () => {
    const pubSub = own(createChannelPubSub<{ done: boolean }>(channelPrefix))

    const key = randomUUID()
    const subA = trackClose(await pubSub.subscribe(key))
    const subB = trackClose(await pubSub.subscribe(key))
    const receivedA = nextMessage<{ done: boolean }>(subA.setHandler)
    const receivedB = nextMessage<{ done: boolean }>(subB.setHandler)
    await pubSub.publish(key, { done: true })
    expect(await receivedA).toEqual({ done: true })
    expect(await receivedB).toEqual({ done: true })
  })

  it('contains decode failures and keeps the subscription usable', async () => {
    const pubSub = own(
      createChannelPubSub<{ x: number }>(channelPrefix, {
        serialize: value => (value.x === 0 ? 'not-json' : JSON.stringify(value)),
      }),
    )

    const key = randomUUID()
    const sub = trackClose(await pubSub.subscribe(key))
    const received = nextMessage<{ x: number }>(sub.setHandler)

    await pubSub.publish(key, { x: 0 })
    await pubSub.publish(key, { x: 1 })
    await expect(received).resolves.toEqual({ x: 1 })
  })

  it('rejects direct subscriber closure while subscriptions are active', async () => {
    const pubSub = own(createChannelPubSub<{ x: number }>(channelPrefix))

    const subscription = trackClose(await pubSub.subscribe(randomUUID()))

    await expect(pubSub.closeSubscriber()).rejects.toThrow(
      'Cannot close subscriber while subscriptions are active',
    )

    await subscription.close()
  })

  it('owner shutdown closes active subscriptions safely and is terminal', async () => {
    const pubSub = own(createChannelPubSub<{ x: number }>(channelPrefix))
    const key = randomUUID()
    const subscription = await pubSub.subscribe(key)

    await Promise.all([pubSub.close(), pubSub.close()])

    await expect(subscription.close()).resolves.toBeUndefined()
    await expect(pubSub.publish(key, { x: 42 })).rejects.toThrow('Channel pub/sub is closed')
    await expect(pubSub.subscribe(key)).rejects.toThrow('Channel pub/sub is closed')
  })
})

function nextMessage<T>(setHandler: (handler: (value: T) => void) => void): Promise<T> {
  return new Promise(resolve => {
    setHandler(value => {
      resolve(value)
    })
  })
}
