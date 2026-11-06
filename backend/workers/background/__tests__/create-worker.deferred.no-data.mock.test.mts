import { afterEach, describe, expect, it, type Mock, vi } from 'vitest'
import type { Job } from 'glide-mq'
import * as inboxReservations from '@data-stores/valkey-glide-mq/activitypub-inbox-reservations'
import * as queueDomainControls from '@services/queue-domain-controls'
import { createBackgroundProcessor } from '../processors.mts'
import { createBackgroundWorker } from '../workers/create-worker.mts'

type WorkerConstructor = typeof import('glide-mq').Worker

const workerMock = vi.hoisted(() => {
  const worker = vi.fn<WorkerConstructor>() as Mock<WorkerConstructor> & WorkerConstructor
  worker.prototype.close = vi.fn<WorkerConstructor['prototype']['close']>(async () => {})
  return worker
})

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, Worker: workerMock }
})

describe('deferred background handlers', () => {
  const workers: Array<{ close(force?: boolean): Promise<void> }> = []

  afterEach(async () => {
    vi.restoreAllMocks()
    await Promise.all(workers.splice(0).map(worker => worker.close()))
  })

  it('constructs the worker before loading handlers', () => {
    let loaded = false
    vi.spyOn(queueDomainControls, 'watchQueueDomainControls').mockResolvedValue({
      close: async () => {},
    })
    vi.spyOn(inboxReservations, 'observeActivityPubInboxReservations').mockReturnValue({
      ready: Promise.resolve(),
      close: async () => {},
    })
    const worker = createBackgroundWorker({
      handlers: () => {
        loaded = true
        return new Promise(() => {})
      },
      domains: ['ses-inbound'],
      prefix: 'deferred_handlers',
    })
    workers.push(worker)

    expect(loaded).toBe(false)
    expect(workerMock).toHaveBeenCalled()
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
