import { describe, expect, it, vi } from 'vitest'
import { workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { createQueue } from '../glide-mq-factory.mts'
import { workerQueueCommandClient } from '../glide-mq-shared-client.mts'
import { registerWorkerQueueScriptFile } from '../glide-mq-scripts.mts'
import { withScheduledRunLease } from '../scheduled-run-lease.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('scheduled run admission', () => {
  it('still skips a fresh tick when overlap metric storage and reporting fail', async () => {
    const name = `lease-metric-${crypto.randomUUID()}`
    const base = `${workerQueuePrefix ?? 'glide'}:{${name}}`
    const queue = createQueue(name, { priorityKind: 'ranked' })
    const first = await queue.add('sweep', {}, { jobId: 'first' })
    const second = await queue.add('sweep', {}, { jobId: 'second' })
    if (!first || !second) throw new Error('Expected both scheduled ticks')
    Object.assign(first, { schedulerName: 'repeat' })
    Object.assign(second, { schedulerName: 'repeat' })
    const release = await withScheduledRunLease(name, first, { lockDuration: 20000 })
    const reportingError = new Error('Sentry capture failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await workerQueueCommandClient.set(`${base}:run-metrics`, 'wrong-type')
      sentryCaptureExceptionMock.mockImplementation(() => {
        throw reportingError
      })
      expect(await withScheduledRunLease(name, second, { lockDuration: 20000 })).toBeNull()
      expect(consoleError).toHaveBeenCalledWith(
        'scheduled_overlap_metric_reporting_failed',
        reportingError,
      )
      expect(
        await workerQueueCommandClient.hget(`${base}:job:${second.id}`, 'scheduledRunLeaseSkipped'),
      ).toBe('repeat')
      await release?.()
      // Even if the collision response were lost, this tick cannot run after the holder releases.
      expect(await withScheduledRunLease(name, second, { lockDuration: 20000 })).toBeNull()
      expect(await workerQueueCommandClient.get(`${base}:run:repeat`)).toBeNull()
    } finally {
      sentryCaptureExceptionMock.mockReset()
      consoleError.mockRestore()
      await release?.()
      await queue.obliterate({ force: true })
      await workerQueueCommandClient.unlink([`${base}:run-metrics`, `${base}:run:repeat:previous`])
      await queue.close()
    }
  })

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
