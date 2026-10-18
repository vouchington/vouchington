import { describe, expect, it, vi } from 'vitest'
import { workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { createQueue } from '../glide-mq-factory.mts'
import { workerQueueCommandClient } from '../glide-mq-shared-client.mts'
import { registerWorkerQueueScriptFile } from '../glide-mq-scripts.mts'
import { withScheduledRunLease } from '../scheduled-run-lease.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('scheduled run admission', () => {
  it('records admission before an expired lease can let a newer tick skip its retry', async () => {
    const name = `lease-admission-retry-${crypto.randomUUID()}`
    const base = `${workerQueuePrefix ?? 'glide'}:{${name}}`
    const leaseKey = `${base}:run:repeat`
    const queue = createQueue(name, { priorityKind: 'ranked' })
    const job = await queue.add('sweep', {}, { jobId: 'scheduled-root' })
    const newer = await queue.add('sweep', {}, { jobId: 'newer-root' })
    if (!job || !newer) throw new Error('Expected scheduled roots')
    Object.assign(job, { schedulerName: 'repeat' })
    Object.assign(newer, { schedulerName: 'repeat' })
    try {
      const release = await withScheduledRunLease(name, job, { lockDuration: 20_000 })
      expect(release).not.toBeNull()
      expect(
        await workerQueueCommandClient.hget(`${base}:job:${job.id}`, 'scheduledRunLeaseAdmitted'),
      ).toBe('repeat')
      // Expire the bounded lease without a clock or timer, then admit a newer tick.
      await workerQueueCommandClient.unlink([leaseKey])
      const newerRelease = await withScheduledRunLease(name, newer, { lockDuration: 20_000 })
      expect(newerRelease).not.toBeNull()
      const admitScript = registerWorkerQueueScriptFile(
        'admit-scheduled-run.lua',
        new URL('../scheduled-run-lease.mts', import.meta.url).href,
      )
      expect(
        await workerQueueCommandClient.invokeScript(admitScript, {
          keys: [leaseKey, `${base}:job:${job.id}`, `${base}:run-metrics`],
          args: [
            job.id,
            'repeat',
            'scheduledRunLeaseAdmitted',
            'scheduledRunLeaseSkipped',
            '20000',
          ],
        }),
      ).toBe(3)
      await newerRelease?.()
      await release?.()
      expect(await workerQueueCommandClient.get(leaseKey)).toBeNull()
    } finally {
      await queue.obliterate({ force: true })
      await workerQueueCommandClient.unlink([leaseKey, `${leaseKey}:previous`])
      await queue.close()
    }
  })
})
