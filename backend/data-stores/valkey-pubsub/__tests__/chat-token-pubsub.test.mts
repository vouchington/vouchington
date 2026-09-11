import { randomUUID } from 'node:crypto'
import { setImmediate } from 'node:timers/promises'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import {
  closeChatTokenSubscriber,
  publishChatToken,
  subscribeChatTokens,
} from '../chat-token-pubsub.mts'

describe('chat-token-pubsub', () => {
  let cleanup: Array<() => void | Promise<void>> = []

  afterEach(async () => {
    for (const fn of cleanup.reverse()) {
      await fn()
    }
    cleanup = []
  })

  afterAll(async () => {
    await closeChatTokenSubscriber()
  })

  function trackClose<T extends { close(): void | Promise<void> }>(subscription: T): T {
    cleanup.push(() => subscription.close())
    return subscription
  }

  it('publishes and receives chat token chunks', async () => {
    const msgId = `msg-${randomUUID()}`
    const sub = trackClose(await subscribeChatTokens(msgId))
    const received: Array<{ type: string; content?: string }> = []
    sub.setHandler(chunk => received.push(chunk))

    await publishChatToken(msgId, { type: 'text', content: 'hello' })

    await vi.waitFor(() => {
      expect(received).toEqual([{ type: 'text', content: 'hello' }])
    })
  })

  it('replays buffered chat token chunks after the handler is installed', async () => {
    const msgId = `msg-${randomUUID()}`
    const sub = trackClose(await subscribeChatTokens(msgId))
    const readinessProbe: Array<{ type: string; content?: string }> = []

    sub.setHandler(chunk => readinessProbe.push(chunk))
    await publishChatToken(msgId, { type: 'text', content: 'ready' })
    await vi.waitFor(() => {
      expect(readinessProbe).toEqual([{ type: 'text', content: 'ready' }])
    })
    sub.setHandler(null)

    await publishChatToken(msgId, { type: 'text', content: 'buffered' })
    await setImmediate()

    const received: Array<{ type: string; content?: string }> = []
    sub.setHandler(chunk => received.push(chunk))

    await vi.waitFor(() => {
      expect(received).toEqual([{ type: 'text', content: 'buffered' }])
    })
  })

  it('delivers the same chunk to multiple subscribers for one conversation message', async () => {
    const msgId = `msg-${randomUUID()}`
    const subA = trackClose(await subscribeChatTokens(msgId))
    const subB = trackClose(await subscribeChatTokens(msgId))
    const receivedA: Array<{ type: string; content?: string }> = []
    const receivedB: Array<{ type: string; content?: string }> = []

    subA.setHandler(chunk => receivedA.push(chunk))
    subB.setHandler(chunk => receivedB.push(chunk))

    await publishChatToken(msgId, { type: 'done' })

    await vi.waitFor(() => {
      expect(receivedA).toEqual([{ type: 'done' }])
      expect(receivedB).toEqual([{ type: 'done' }])
    })
  })
})
