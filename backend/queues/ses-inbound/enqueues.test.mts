import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import {
  getSesInboundProcessJobOptions,
  type SesInboundProcessJobData,
} from '@ts-shared/ses-inbound-contract'
import {
  enqueueOrRetryBulkSesInboundProcess,
  enqueueSesInboundProcess,
  enqueueSesInboundReconcile,
  enqueueSesInboundReconcileContinuation,
} from './enqueues.mts'
import { sesInboundQueue } from './queues.mts'

describe('SES inbound enqueues', () => {
  it('uses the shared deterministic process job contract', async () => {
    const sesMessageId = `ses-${crypto.randomUUID()}`
    const data: SesInboundProcessJobData = {
      sesMessageId,
      objectKey: `copyright-incoming/${sesMessageId}`,
    }

    const job = await enqueueSesInboundProcess(data)

    expect(job).toMatchObject({
      data,
      opts: getSesInboundProcessJobOptions(data),
    })
  })

  it('enqueues a throttled reconciliation job', async () => {
    const job = await enqueueSesInboundReconcile()

    expect(job).toMatchObject({
      data: {},
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
        priority: 100,
        ordering: { key: 'ses-inbound-reconciliation', concurrency: 1 },
        removeOnComplete: 100,
        removeOnFail: 100,
        deduplication: { id: 'ses_inbound_reconcile', mode: 'throttle', ttl: 300_000 },
      },
    })
  })

  it('deduplicates a continuation by its opaque token digest without scheduled throttle', async () => {
    const token = `opaque:${crypto.randomUUID()}`
    const first = await enqueueSesInboundReconcileContinuation(token)
    const second = await enqueueSesInboundReconcileContinuation(token)
    expect(first).toMatchObject({
      data: { continuationToken: token },
      opts: {
        jobId: `ses_inbound_reconcile_continuation__${createHash('sha256').update(token).digest('hex')}`,
        ordering: { key: 'ses-inbound-reconciliation', concurrency: 1 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    })
    expect(first).not.toHaveProperty('opts.deduplication')
    expect(second).toBeNull()
  })

  it('retries only failed process jobs that still have copyright objects', async () => {
    const current = {
      sesMessageId: 'ses-current',
      objectKey: 'copyright-incoming/ses-current',
    }
    const currentId = getSesInboundProcessJobOptions(current).jobId
    const retryCurrent = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const retryOther = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const enqueueBulk = vi.fn<() => Promise<never[]>>().mockResolvedValue([])

    await expect(
      enqueueOrRetryBulkSesInboundProcess([current], undefined, {
        enqueueBulk,
        getFailedJobs: async () => [
          { id: currentId, name: 'processInboundEmail', retry: retryCurrent },
          { id: 'other-process', name: 'processInboundEmail', retry: retryOther },
          { id: currentId, name: 'reconcileInboundEmail', retry: retryOther },
        ],
      }),
    ).resolves.toBe(1)
    expect(enqueueBulk).toHaveBeenCalledWith([current])
    expect(retryCurrent).toHaveBeenCalledOnce()
    expect(retryOther).not.toHaveBeenCalled()
  })

  it('uses the default bulk queue and failed-job scan', async () => {
    const sesMessageId = `ses-${crypto.randomUUID()}`
    const data: SesInboundProcessJobData = {
      sesMessageId,
      objectKey: `copyright-incoming/${sesMessageId}`,
    }

    await expect(enqueueOrRetryBulkSesInboundProcess([data])).resolves.toBe(0)

    const job = await sesInboundQueue.getJob(getSesInboundProcessJobOptions(data).jobId)
    expect(job).toMatchObject({
      name: 'processInboundEmail',
      data,
    })
  })
})
