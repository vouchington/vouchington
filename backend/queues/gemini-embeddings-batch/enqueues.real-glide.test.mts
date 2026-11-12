import { randomUUID } from 'node:crypto'
import { Queue, Worker } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { startRealGlideJobLifecycle } from '@voucha/test-helpers/real-glide-job-lifecycle'
import { pollingJobOptions } from './enqueues.mts'

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('per-batch polling admission', () => {
  it('coalesces dispatch ticks beyond the old throttle window while a download is active', async () => {
    const name = `gemini_poll_active_${randomUUID()}`
    const queue = new Queue(name, connection)
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const completed = Promise.withResolvers<void>()
    let calls = 0
    const worker = new Worker(
      name,
      async () => {
        calls++
        started.resolve()
        await release.promise
      },
      { ...connection, concurrency: 2, blockTimeout: 100 },
    )
    worker.on('completed', () => completed.resolve())
    try {
      await worker.waitUntilReady()
      const options = pollingJobOptions(randomUUID())
      expect(await queue.add('poll', {}, options)).not.toBeNull()
      await waitForRealGlideEvent(started.promise, 'poll download started')
      // Advance producer timestamps beyond two schedule ticks without a wall-clock sleep.
      const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 120_000)
      try {
        expect(await queue.add('poll', {}, options)).toBeNull()
        expect(await queue.add('poll', {}, options)).toBeNull()
      } finally {
        clock.mockRestore()
      }
      expect(calls).toBe(1)
      release.resolve()
      await waitForRealGlideEvent(completed.promise, 'poll ingestion completed')
      expect(await queue.add('poll', {}, options)).not.toBeNull()
    } finally {
      release.resolve()
      await worker.close(true)
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it.each(['complete', 'fail'] as const)(
    'admits the next poll after terminal %s',
    async outcome => {
      const lifecycle = await startRealGlideJobLifecycle('gemini_poll_recovery', connection)
      try {
        lifecycle.setOutcome(outcome)
        const options = { ...pollingJobOptions(randomUUID()), attempts: 1, priority: 0 }
        const first = await lifecycle.queue.add('poll', {}, options)
        if (!first) throw new Error('Expected first polling job')
        expect(await lifecycle.settled(first)).toBe(outcome === 'complete' ? 'completed' : 'failed')
        expect(await lifecycle.queue.add('poll', {}, options)).not.toBeNull()
      } finally {
        await lifecycle.close()
      }
    },
  )
})
