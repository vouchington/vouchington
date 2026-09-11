import { TestWorker } from 'glide-mq/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addAndFlush,
  addBulkAndFlush,
  DEFAULT_FLUSH_TIMEOUT_MS,
  TestQueueFlushTimeoutError,
} from './glide-mq-vitest-flush.mts'
import { getOrCreateQueue } from './glide-mq-vitest-internals.mts'
import { Worker } from './glide-mq-vitest-shim.mts'

function uniqueQueueName(label: string): string {
  return `flush-${label}-${crypto.randomUUID()}`
}

describe('GlideMQ test drain', () => {
  const workers: TestWorker<unknown, unknown>[] = []
  let releaseHang: (() => void) | undefined

  afterEach(async () => {
    releaseHang?.()
    releaseHang = undefined
    const closing = workers.splice(0)
    await Promise.all(closing.map(worker => worker.close()))
  })

  it('keeps the default drain deadline under backend-mocks testTimeout', () => {
    expect(DEFAULT_FLUSH_TIMEOUT_MS).toBeLessThan(15_000)
    expect(DEFAULT_FLUSH_TIMEOUT_MS).toBeGreaterThan(12_000)
  })

  it('waits for a delayed processor via addAndFlush', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('delayed'))
    let processorStarted!: () => void
    const started = new Promise<void>(resolve => {
      processorStarted = resolve
    })
    let releaseProcessor!: () => void
    const processorGate = new Promise<void>(resolve => {
      releaseProcessor = resolve
    })
    workers.push(
      new TestWorker(queue, async () => {
        processorStarted()
        await processorGate
        return 'ok'
      }),
    )

    const flushing = addAndFlush(queue, 'slow', { n: 1 })
    await started
    const pending = Symbol('pending')
    expect(await Promise.race([flushing, Promise.resolve(pending)])).toBe(pending)
    releaseProcessor()
    const job = await flushing
    expect(job).not.toBeNull()
    expect(queue.jobs.get(job!.id)?.state).toBe('completed')
  })

  it('flushes two jobs through addBulkAndFlush', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('bulk'))
    workers.push(new TestWorker(queue, async (job: { data: unknown }) => job.data))

    const jobs = await addBulkAndFlush(queue, [
      { name: 'first', data: { n: 1 } },
      { name: 'second', data: { n: 2 } },
    ])
    expect(jobs).toHaveLength(2)
    expect(jobs.map(job => queue.jobs.get(job!.id)?.state)).toEqual(['completed', 'completed'])
  })

  it('waits for nested addAndFlush from inside a raw TestWorker', async () => {
    const outer = getOrCreateQueue(uniqueQueueName('outer'))
    const inner = getOrCreateQueue(uniqueQueueName('inner'))
    workers.push(
      new TestWorker(inner, async () => 'inner-ok'),
      new TestWorker(outer, async () => {
        const nested = await addAndFlush(inner, 'inner', { n: 1 })
        return nested?.id
      }),
    )

    const job = await addAndFlush(outer, 'outer', { n: 1 })
    expect(job).not.toBeNull()
    expect(outer.jobs.get(job!.id)?.state).toBe('completed')
    expect([...inner.jobs.values()].map(record => record.state)).toEqual(['completed'])
  })

  it('does not wait for nested enqueue from a shim Worker processor', async () => {
    const outerName = uniqueQueueName('shim-outer')
    const innerName = uniqueQueueName('shim-inner')
    const hang = new Promise<void>(resolve => {
      releaseHang = resolve
    })
    workers.push(
      new Worker(innerName, async () => hang),
      new Worker(outerName, async () => {
        await addAndFlush(getOrCreateQueue(innerName), 'inner', { n: 1 }, { flushTimeoutMs: 50 })
        await addBulkAndFlush(getOrCreateQueue(innerName), [
          { name: 'inner-bulk', data: { n: 2 }, opts: { flushTimeoutMs: 50 } },
        ])
        return 'ok'
      }),
    )

    const job = await addAndFlush(
      getOrCreateQueue(outerName),
      'outer',
      { n: 1 },
      {
        flushTimeoutMs: 200,
      },
    )
    expect(job).not.toBeNull()
    expect(getOrCreateQueue(outerName).jobs.get(job!.id)?.state).toBe('completed')
    expect(
      [...getOrCreateQueue(innerName).jobs.values()].map(record => record.state),
    ).not.toContain('completed')
  })

  it('still flushes test-side addAndFlush while a shim Worker processor is in flight', async () => {
    const hungName = uniqueQueueName('als-hung')
    const siblingName = uniqueQueueName('als-sibling')
    const hang = new Promise<void>(resolve => {
      releaseHang = resolve
    })
    let processorStarted!: () => void
    const processorGate = new Promise<void>(resolve => {
      processorStarted = resolve
    })
    workers.push(
      new Worker(hungName, async () => {
        processorStarted()
        await hang
      }),
      new Worker(siblingName, async () => {
        return 'ok'
      }),
    )

    const hungFlush = addAndFlush(
      getOrCreateQueue(hungName),
      'hang',
      { n: 1 },
      {
        flushTimeoutMs: 500,
      },
    )
    await processorGate
    const sibling = await addAndFlush(getOrCreateQueue(siblingName), 'ok', { n: 2 })
    expect(sibling).not.toBeNull()
    expect(getOrCreateQueue(siblingName).jobs.get(sibling!.id)?.state).toBe('completed')
    releaseHang?.()
    releaseHang = undefined
    await hungFlush
  })

  it('times out a hung processor when Date is faked', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const queue = getOrCreateQueue(uniqueQueueName('fake-date'))
      const hang = new Promise<void>(resolve => {
        releaseHang = resolve
      })
      workers.push(new TestWorker(queue, async () => hang))

      const error = await addAndFlush(queue, 'hang', { n: 1 }, { flushTimeoutMs: 50 }).then(
        () => {
          throw new Error('expected addAndFlush to reject')
        },
        (reason: unknown) => reason,
      )
      expect(error).toBeInstanceOf(TestQueueFlushTimeoutError)
    } finally {
      vi.useRealTimers()
    }
  })

  it('shares one completed listener across concurrent flushes', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('shared-listener'))
    const worker = new TestWorker(queue, async (job: { data: unknown }) => job.data)
    workers.push(worker)

    const jobs = await Promise.all(
      Array.from({ length: 12 }, (_, index) => addAndFlush(queue, 'n', { index })),
    )
    expect(jobs).toHaveLength(12)
    expect(
      (worker as { listenerCount: (event: string) => number }).listenerCount('completed'),
    ).toBe(1)
  })

  it('throws TestQueueFlushTimeoutError for a hung processor', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('hung'))
    const hang = new Promise<void>(resolve => {
      releaseHang = resolve
    })
    workers.push(new TestWorker(queue, async () => hang))

    const error = await addAndFlush(queue, 'hang', { n: 1 }, { flushTimeoutMs: 50 }).then(
      () => {
        throw new Error('expected addAndFlush to reject')
      },
      (reason: unknown) => reason,
    )

    expect(error).toBeInstanceOf(TestQueueFlushTimeoutError)
    const timeoutError = error as TestQueueFlushTimeoutError
    expect(timeoutError.queueName).toBe(queue.name)
    expect(timeoutError.flushTimeoutMs).toBe(50)
    expect(timeoutError.jobIds).toHaveLength(1)
    expect(timeoutError.pendingJobIds).toEqual(timeoutError.jobIds)
    // A dispatched-but-slow job reads 'active' with a consumed worker slot — the mirror image of
    // the 'waiting'/starved case below, so diagnostics can tell the two apart either way.
    expect(timeoutError.diagnostics.workers).toEqual([{ activeCount: 1, concurrency: 1 }])
    expect(timeoutError.diagnostics.pendingJobs[0]).toMatchObject({
      state: 'active',
      inWaitingQueue: false,
    })
  })

  it('diagnoses starvation (waiting, still queued) as distinct from a hung-in-place job (active)', async () => {
    // Reproduces the mechanism behind #10722/#10782/#10817: a processor promise that never
    // settles never reaches TestWorker's `.finally()`, so it permanently pins a concurrency
    // slot (see glide-mq's testing.js `processJob`) with no relationship to `queue.jobs` state —
    // `obliterateTestQueue` cannot reclaim it, by design (see glide-mq-vitest-obliterate.mts).
    // A later job on the same queue is then starved: it never dispatches and stays 'waiting'
    // forever, which a flush timeout could not previously distinguish from a job that dispatched
    // and is merely slow ('active'). This test asserts the new diagnostics make that call.
    const queue = getOrCreateQueue(uniqueQueueName('starved'))
    const hang = new Promise<void>(resolve => {
      releaseHang = resolve
    })
    let leakStarted!: () => void
    const leakGate = new Promise<void>(resolve => {
      leakStarted = resolve
    })
    const worker = new TestWorker(
      queue,
      async () => {
        leakStarted()
        return hang
      },
      { concurrency: 1 },
    )
    workers.push(worker)

    void queue.add('leak', { n: 0 })
    await leakGate

    const error = await addAndFlush(queue, 'starved', { n: 1 }, { flushTimeoutMs: 50 }).then(
      () => {
        throw new Error('expected addAndFlush to reject')
      },
      (reason: unknown) => reason,
    )

    expect(error).toBeInstanceOf(TestQueueFlushTimeoutError)
    const timeoutError = error as TestQueueFlushTimeoutError
    expect(timeoutError.diagnostics.workers).toEqual([{ activeCount: 1, concurrency: 1 }])
    expect(timeoutError.diagnostics.waitingQueueLength).toBe(1)
    expect(timeoutError.diagnostics.isPaused).toBe(false)
    expect(timeoutError.diagnostics.pendingJobs).toHaveLength(1)
    expect(timeoutError.diagnostics.pendingJobs[0]).toMatchObject({
      jobId: timeoutError.pendingJobIds[0],
      state: 'waiting',
      inWaitingQueue: true,
    })
    // The leaked job itself is 'active', not 'waiting' — it was dispatched and never released.
    const leakedRecord = [...queue.jobs.values()].find(record => record.name === 'leak')
    expect(leakedRecord?.state).toBe('active')
  })

  it('throws immediately when a flushed job fails', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('fail'))
    workers.push(
      new TestWorker(queue, () => {
        throw new Error('planned failure')
      }),
    )

    const error = await addAndFlush(queue, 'fail', { n: 1 }).then(
      () => {
        throw new Error('expected addAndFlush to reject')
      },
      (reason: unknown) => reason,
    )
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(TestQueueFlushTimeoutError)
  })
})
