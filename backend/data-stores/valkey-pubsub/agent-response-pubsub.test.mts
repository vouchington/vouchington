import { afterAll, afterEach, describe, expect, it } from 'vitest'
import {
  type AgentResponseEvent,
  closeAgentResponseSubscriber,
  publishAgentResponseEvent,
  subscribeAgentResponseEvents,
} from './agent-response-pubsub.mts'
import { v7 as uuidv7 } from 'uuid'

describe('agent-response-pubsub', () => {
  let cleanup: Array<() => void | Promise<void>> = []

  afterEach(async () => {
    for (const close of cleanup.reverse()) {
      await close()
    }
    cleanup = []
  })

  afterAll(async () => {
    await closeAgentResponseSubscriber()
  })

  function trackClose<T extends { close(): void | Promise<void> }>(subscription: T): T {
    cleanup.push(() => subscription.close())
    return subscription
  }

  it('subscribes to events and receives a published event via the handler', async () => {
    const agentResponseId = uuidv7()

    const subscription = trackClose(await subscribeAgentResponseEvents(agentResponseId))

    const received: AgentResponseEvent[] = []
    const delivered = Promise.withResolvers<void>()
    subscription.setHandler(chunk => {
      received.push(chunk)
      delivered.resolve()
    })

    await publishAgentResponseEvent(agentResponseId, { type: 'progress', content: 'hello' })
    await delivered.promise

    await subscription.close()

    expect(received).toEqual(expect.arrayContaining([{ type: 'progress', content: 'hello' }]))
  }, 10_000)

  it('does not deliver events after subscription is closed', async () => {
    const agentResponseId = uuidv7()
    const received: AgentResponseEvent[] = []
    const delivered = Promise.withResolvers<void>()

    const subscription = trackClose(await subscribeAgentResponseEvents(agentResponseId))
    const deliveryLatch = trackClose(await subscribeAgentResponseEvents(agentResponseId))
    subscription.setHandler(chunk => {
      received.push(chunk)
    })
    deliveryLatch.setHandler(() => {
      delivered.resolve()
    })
    await subscription.close()

    await publishAgentResponseEvent(agentResponseId, { type: 'done', content: 'too late' })
    await delivered.promise

    expect(received).toHaveLength(0)
  }, 10_000)

  it('publishes a done event successfully', async () => {
    const agentResponseId = uuidv7()

    const subscription = trackClose(await subscribeAgentResponseEvents(agentResponseId))

    const received: AgentResponseEvent[] = []
    const delivered = Promise.withResolvers<void>()
    subscription.setHandler(chunk => {
      received.push(chunk)
      delivered.resolve()
    })

    await publishAgentResponseEvent(agentResponseId, { type: 'done', content: 'final answer' })
    await delivered.promise

    await subscription.close()

    expect(received.some(c => c.type === 'done')).toBe(true)
  }, 10_000)
})
