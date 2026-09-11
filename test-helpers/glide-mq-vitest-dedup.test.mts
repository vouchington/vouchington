import { TestWorker } from 'glide-mq/testing'
import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addAndFlush, addBulkAndFlush } from './glide-mq-vitest-flush.mts'
import { getOrCreateQueue } from './glide-mq-vitest-internals.mts'

function uniqueQueueName(label: string): string {
  return `dedup-${label}-${crypto.randomUUID()}`
}

describe('GlideMQ test dedup', () => {
  const workers: TestWorker<unknown, unknown>[] = []
  let releaseHang: (() => void) | undefined

  afterEach(async () => {
    vi.useRealTimers()
    releaseHang?.()
    releaseHang = undefined
    const closing = workers.splice(0)
    await Promise.all(closing.map(worker => worker.close()))
  })

  it('simple mode skips a second enqueue while the referenced job is non-terminal, then allows one once it settles', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('simple'))
    let processorStarted!: () => void
    const processorGate = new Promise<void>(resolve => {
      processorStarted = resolve
    })
    const hang = new Promise<void>(resolve => {
      releaseHang = resolve
    })
    workers.push(
      new TestWorker(queue, async () => {
        processorStarted()
        await hang
        return 'ok'
      }),
    )

    const dedupOpts = { deduplication: { id: 'simple-id', mode: 'simple' as const } }
    const firstFlush = addAndFlush(queue, 'first', { n: 1 }, dedupOpts)
    await processorGate
    const skipped = await addAndFlush(queue, 'second', { n: 2 }, dedupOpts)
    expect(skipped).toBeNull()
    expect(queue.jobs.size).toBe(1)

    releaseHang?.()
    releaseHang = undefined
    const first = await firstFlush
    expect(first).not.toBeNull()
    expect(queue.jobs.get(first!.id)?.state).toBe('completed')

    const third = await addAndFlush(queue, 'third', { n: 3 }, dedupOpts)
    expect(third).not.toBeNull()
    expect(queue.jobs.size).toBe(2)
  })

  it('debounce mode degenerates to simple state-gating (the shim never produces delayed/prioritized jobs)', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('debounce'))
    let processorStarted!: () => void
    const processorGate = new Promise<void>(resolve => {
      processorStarted = resolve
    })
    const hang = new Promise<void>(resolve => {
      releaseHang = resolve
    })
    workers.push(
      new TestWorker(queue, async () => {
        processorStarted()
        await hang
        return 'ok'
      }),
    )

    const dedupOpts = {
      deduplication: { id: 'debounce-id', mode: 'debounce' as const, ttl: 300_000 },
    }
    const firstFlush = addAndFlush(queue, 'first', { n: 1 }, dedupOpts)
    await processorGate
    const skipped = await addAndFlush(queue, 'second', { n: 2 }, dedupOpts)
    expect(skipped).toBeNull()
    expect(queue.jobs.size).toBe(1)

    releaseHang?.()
    releaseHang = undefined
    await firstFlush
  })

  it('throttle mode ignores job state and gates purely on elapsed time against ttl', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const queue = getOrCreateQueue(uniqueQueueName('throttle'))
    workers.push(new TestWorker(queue, async (job: { data: unknown }) => job.data))
    const dedupOpts = { deduplication: { id: 'throttle-id', mode: 'throttle' as const, ttl: 50 } }

    const first = await addAndFlush(queue, 'first', { n: 1 }, dedupOpts)
    expect(first).not.toBeNull()
    expect(queue.jobs.get(first!.id)?.state).toBe('completed')

    // The referenced job is already terminal, but throttle skips purely on elapsed time.
    const second = await addAndFlush(queue, 'second', { n: 2 }, dedupOpts)
    expect(second).toBeNull()
    expect(queue.jobs.size).toBe(1)

    await vi.advanceTimersByTimeAsync(60)
    const third = await addAndFlush(queue, 'third', { n: 3 }, dedupOpts)
    expect(third).not.toBeNull()
    expect(queue.jobs.size).toBe(2)
  })

  it('throttle mode falls back to state-gating when the referenced job carried a delay (regression for the elections vote-stats failure)', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('throttle-delayed'))
    workers.push(new TestWorker(queue, async (job: { data: unknown }) => job.data))
    // Mirrors buildElectionJobOptions: throttle ttl shorter than the job's own delay. Production
    // relies on delay >= ttl so the referenced job can't go terminal before the window elapses; the
    // shim ignores delay, so without the state-gating fallback this would wrongly skip forever.
    const dedupOpts = {
      deduplication: { id: 'throttle-delayed-id', mode: 'throttle' as const, ttl: 5_000 },
      delay: 6_000,
    }

    const first = await addAndFlush(queue, 'first', { n: 1 }, dedupOpts)
    expect(first).not.toBeNull()
    expect(queue.jobs.get(first!.id)?.state).toBe('completed')

    // Well inside the 5s ttl, but the referenced job is already terminal — a delayed throttle job
    // must not keep skipping past its own completion.
    const second = await addAndFlush(queue, 'second', { n: 2 }, dedupOpts)
    expect(second).not.toBeNull()
    expect(queue.jobs.size).toBe(2)
  })

  it('throttle mode with no delay keeps skipping a terminal referenced job (mirrors the plain throttle-id case above with an explicit delay: 0)', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('throttle-undelayed'))
    workers.push(new TestWorker(queue, async (job: { data: unknown }) => job.data))
    const dedupOpts = {
      deduplication: { id: 'throttle-undelayed-id', mode: 'throttle' as const, ttl: 5_000 },
      delay: 0,
    }

    const first = await addAndFlush(queue, 'first', { n: 1 }, dedupOpts)
    expect(first).not.toBeNull()
    expect(queue.jobs.get(first!.id)?.state).toBe('completed')

    const second = await addAndFlush(queue, 'second', { n: 2 }, dedupOpts)
    expect(second).toBeNull()
    expect(queue.jobs.size).toBe(1)
  })

  it('reserves synchronously so concurrent adds on the same dedup id cannot both slip past the check (regression for the Promise.all race)', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('concurrent'))
    workers.push(new TestWorker(queue, async (job: { data: unknown }) => job.data))
    const dedupOpts = { deduplication: { id: 'concurrent-id', mode: 'simple' as const } }

    const [first, second] = await Promise.all([
      addAndFlush(queue, 'first', { n: 1 }, dedupOpts),
      addAndFlush(queue, 'second', { n: 2 }, dedupOpts),
    ])
    const created = [first, second].filter(job => job !== null)
    expect(created).toHaveLength(1)
    expect(queue.jobs.size).toBe(1)
  })

  it('addBulkAndFlush shares one timestamp across the batch and preserves order/length on a skip', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('bulk'))
    workers.push(new TestWorker(queue, async (job: { data: unknown }) => job.data))
    const deduplication = { id: 'bulk-dedup-id', mode: 'simple' as const }

    const results = await addBulkAndFlush(queue, [
      { name: 'a', data: { n: 1 }, opts: { deduplication } },
      { name: 'b', data: { n: 2 }, opts: { deduplication } },
    ])
    expect(results).toHaveLength(2)
    expect(results[0]).not.toBeNull()
    expect(results[1]).toBeNull()
    expect(queue.jobs.size).toBe(1)
  })

  it('caps a growing backlog to one non-terminal job with no worker attached, then drains it promptly once one attaches (regression for the psql accumulation failure)', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('backlog-cap'))
    const dedupOpts = {
      deduplication: {
        id: 'refresh-materialized-view__mv_top_hashtags',
        mode: 'debounce' as const,
        ttl: 300_000,
      },
    }

    // No worker attached: entity-listener-style enqueues race ahead of a worker-less queue, exactly
    // like the real psql queue before a worker preloads. Dedup must cap this at one job.
    for (let index = 0; index < 200; index++) {
      await addAndFlush(
        queue,
        'refreshMaterializedView',
        { viewName: 'mv_top_hashtags', index },
        dedupOpts,
      )
    }
    expect(queue.jobs.size).toBe(1)
    expect(queue.waitingQueue).toHaveLength(1)

    const [backloggedJobId] = queue.jobs.keys()
    const startedAt = Date.now()
    const worker = new TestWorker(queue, async () => 'ok')
    workers.push(worker)
    try {
      await once(worker, 'completed', { signal: AbortSignal.timeout(2_000) })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          'Timed out waiting for the attached worker to drain the deduplicated backlog',
          { cause: error },
        )
      }
      throw error
    }

    expect(Date.now() - startedAt).toBeLessThan(2_000)
    expect(queue.jobs.get(backloggedJobId!)?.state).toBe('completed')
  })

  it('without deduplication, the same backlog is unbounded (documents the pre-fix accumulation shape)', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('backlog-undeduped'))
    for (let index = 0; index < 200; index++) {
      await addAndFlush(queue, 'refreshMaterializedView', { viewName: 'mv_top_hashtags', index })
    }
    expect(queue.jobs.size).toBe(200)
    expect(queue.waitingQueue).toHaveLength(200)
  })
})
