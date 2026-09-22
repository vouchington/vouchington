import { describe, expect, it, vi } from 'vitest'
import {
  getSesInboundProcessJobOptions,
  type SesInboundProcessJobData,
} from '@ts-shared/ses-inbound-contract'
import {
  enqueueOrRetryBulkSesInboundProcess,
  enqueueSesInboundProcess,
  enqueueSesInboundReconcile,
} from './enqueues.mts'
import { sesInboundQueue } from './queues.mts'

describe('SES inbound enqueues', () => {
  it('uses the shared deterministic process job contract', async () => {
    const sesMessageId = `ses-${crypto.randomUUID()}`
    const data: SesInboundProcessJobData = {
      sesMessageId,
      objectKey: `copyright-incoming/${sesMessageId}`,
      intakeKind: 'copyright',
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

  it('retries only failed process jobs that still have copyright objects', async () => {
    const current = {
      sesMessageId: 'ses-current',
      objectKey: 'copyright-incoming/ses-current',
      intakeKind: 'copyright' as const,
    }
    const currentId = getSesInboundProcessJobOptions(current).jobId
    const retryCurrent = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const retryOther = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const enqueueBulk = vi.fn<() => Promise<never[]>>().mockResolvedValue([])

    await expect(
      enqueueOrRetryBulkSesInboundProcess([current], {
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
      intakeKind: 'copyright',
    }

    await expect(enqueueOrRetryBulkSesInboundProcess([data])).resolves.toBe(0)

    const job = await sesInboundQueue.getJob(getSesInboundProcessJobOptions(data).jobId)
    expect(job).toMatchObject({
      name: 'processInboundEmail',
      data,
    })
  })
})
