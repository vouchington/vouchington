import { afterEach, describe, expect, it, vi } from 'vitest'
import { WORKER_DEFINITIONS } from './worker-definitions.mts'
import { SQS_CONSUMER_DEFINITIONS } from './sqs-consumer-definitions.mts'

describe('worker-cpu serve entrypoint wrapper', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('registers the serve wrapper on import without starting selected workers', async () => {
    const originalNodePrewarm = process.env.NODE_PREWARM
    const originalNodePrewarmPort = process.env.NODE_PREWARM_PORT
    const originalNodeEnv = process.env.NODE_ENV
    const originalQueues = process.env.QUEUES

    try {
      process.env.NODE_PREWARM = '1'
      // NODE_PREWARM_PORT must stay unset: the runtime now only binds a real prewarm
      // listener when it is explicitly set, and pool: 'forks' + isolate: false means a
      // sibling serve.prewarm.test.mts run in the same fork could otherwise leave it set.
      delete process.env.NODE_PREWARM_PORT
      process.env.NODE_ENV = 'production'
      process.env.QUEUES = [...WORKER_DEFINITIONS, ...SQS_CONSUMER_DEFINITIONS]
        .map(definition => `-${definition.queueName}`)
        .join(',')

      await import('./serve.mts')
      const runtime = await import('./index.mts')

      expect(Array.isArray(runtime.default)).toBe(true)
      expect(Array.isArray(runtime.sqsConsumers)).toBe(true)
      await Promise.all(runtime.default.map(worker => worker.close()))
      await Promise.all(runtime.sqsConsumers.map(consumer => consumer.close()))
    } finally {
      if (originalNodePrewarm === undefined) {
        delete process.env.NODE_PREWARM
      } else {
        process.env.NODE_PREWARM = originalNodePrewarm
      }

      if (originalNodePrewarmPort === undefined) {
        delete process.env.NODE_PREWARM_PORT
      } else {
        process.env.NODE_PREWARM_PORT = originalNodePrewarmPort
      }

      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = originalNodeEnv
      }

      if (originalQueues === undefined) {
        delete process.env.QUEUES
      } else {
        process.env.QUEUES = originalQueues
      }
    }
  })
})
