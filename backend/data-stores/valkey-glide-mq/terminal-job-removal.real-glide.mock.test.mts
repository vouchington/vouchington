import { randomUUID } from 'node:crypto'
import { Queue, Worker, UnrecoverableError } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { removeTerminalJobsWhen } from './terminal-job-removal.mts'

describe('retained failed job pruning with real GlideMQ', () => {
  it('removes a settled failure and preserves a failure retried during WATCH', async () => {
    const name = `ai-prune-${randomUUID()}`
    const queue = new Queue<{ responseIds: string[] }>(name, {
      connection: workerQueueConnection,
      prefix: workerQueuePrefix,
    })
    const ids = [randomUUID(), randomUUID()]
    const failed = Promise.withResolvers<void>()
    const worker = new Worker(
      name,
      async () => {
        throw new UnrecoverableError('terminal test failure')
      },
      { connection: workerQueueConnection, prefix: workerQueuePrefix, blockTimeout: 100 },
    )
    const failures = new Set<string>()
    worker.on('failed', job => {
      if (job) failures.add(job.id)
      if (failures.size === ids.length) failed.resolve()
    })
    worker.on('error', failed.reject)
    try {
      await worker.waitUntilReady()
      for (const id of ids) {
        await queue.add('billable', { responseIds: [id] }, { jobId: id, removeOnFail: false })
      }
      await waitForRealGlideEvent(failed.promise, `failed jobs ${name}`)
    } finally {
      await worker.close(true)
    }

    try {
      await expect(removeTerminalJobsWhen(queue, [ids[0]!], () => true)).resolves.toBe(1)
      await expect(queue.getJob(ids[0]!)).resolves.toBeNull()

      const watched = Promise.withResolvers<void>()
      const release = Promise.withResolvers<void>()
      const pruning = removeTerminalJobsWhen(queue, [ids[1]!], async () => {
        watched.resolve()
        await release.promise
        return true
      })
      await waitForRealGlideEvent(watched.promise, `WATCH ${ids[1]}`)
      const retained = await queue.getJob(ids[1]!)
      await retained?.retry()
      release.resolve()
      await expect(pruning).resolves.toBe(0)
      expect(['waiting', 'delayed']).toContain(await (await queue.getJob(ids[1]!))?.getState())
    } finally {
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())
