import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it, type Mock, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  SES_INBOUND_PROCESS_JOB,
  SES_INBOUND_RECONCILE_JOB,
} from '@queues/background/enqueues/ses-inbound-jobs'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { createBackgroundProcessor } from '../processors.mts'

type WorkerConstructor = typeof import('glide-mq').Worker

const workerMock = vi.hoisted(() => {
  const worker = vi.fn<WorkerConstructor>() as Mock<WorkerConstructor> & WorkerConstructor
  worker.prototype.close = vi.fn<WorkerConstructor['prototype']['close']>(async () => {})
  return worker
})

// The constructor is mocked so the test can run the processor without a live consumer.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, Worker: workerMock }
})

function backgroundProcessor(): (job: Job) => Promise<unknown> {
  const call = workerMock.mock.calls.findLast(([queueName]) => queueName === BACKGROUND_QUEUE_NAME)
  const processor = call?.[1]
  if (typeof processor !== 'function') throw new Error('Background worker was not constructed')
  // createBackgroundWorker uses the single-job factory, whose mock signature also includes batch.
  return processor as (job: Job) => Promise<unknown>
}

describe('deferred background handlers', () => {
  beforeAll(() => {
    // Setup preloads the data-store factory against the real Worker. Rebuild it on the mock.
    vi.resetModules()
  })

  it('constructs the worker before loading handlers, then loads them once', async () => {
    const { createBackgroundWorker } = await import('../workers/create-worker.mts')
    workerMock.mockClear()
    let calls = 0
    const handled = Symbol('handled')
    const worker = createBackgroundWorker({
      handlers: () => {
        calls += 1
        return Promise.resolve([
          backgroundHandler(SES_INBOUND_PROCESS_JOB, () => handled),
          backgroundHandler(SES_INBOUND_RECONCILE_JOB, () => undefined),
        ])
      },
      domains: ['ses-inbound'],
      prefix: `deferred_${randomUUID().replaceAll('-', '')}`,
    })

    try {
      expect(calls).toBe(0)
      const job = {
        id: randomUUID(),
        name: SES_INBOUND_PROCESS_JOB.name,
        opts: {},
      } as Job
      const processor = backgroundProcessor()
      await expect(processor(job)).resolves.toBe(handled)
      await expect(processor(job)).resolves.toBe(handled)
      expect(calls).toBe(1)
    } finally {
      await worker.close()
    }
  })

  it('loads a deferred handler map on the first job only', async () => {
    let calls = 0
    const processJob = createBackgroundProcessor(() => {
      calls += 1
      return Promise.resolve(new Map())
    })

    expect(calls).toBe(0)
    await expect(processJob({ name: 'not-a-background-job' } as Job)).rejects.toThrow(
      'Unknown background job',
    )
    await expect(processJob({ name: 'not-a-background-job' } as Job)).rejects.toThrow(
      'Unknown background job',
    )
    expect(calls).toBe(1)
  })
})
