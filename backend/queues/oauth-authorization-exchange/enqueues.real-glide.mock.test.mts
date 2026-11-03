import { randomUUID } from 'node:crypto'
import { Job, Worker } from 'glide-mq'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import {
  closeAndUnregisterGlideMQInstance,
  ENQUEUE_BASE_DEFAULTS,
} from '@data-stores/valkey-glide-mq'
import { background } from '@queues/background/queues'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { startRealGlideJobLifecycle } from '@voucha/test-helpers/real-glide-job-lifecycle'
import {
  OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_JOB,
  OAUTH_AUTHORIZATION_EXCHANGE_JOB,
  type OAuthAuthorizationExchangeJobData,
} from '@queues/background/enqueues/oauth-authorization-exchange-jobs'
import {
  enqueueOrReactivateBulkOAuthAuthorizationExchanges,
  enqueueOAuthAuthorizationExchangeDispatcher,
} from './enqueues.mts'
import { oauthAuthorizationExchangeQueue } from './queues.mts'

vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0])
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

// A graceful close waits out the worker's in-flight blocking read, so keep that read short.
const workerOptions = {
  connection: workerQueueConnection,
  prefix: workerQueuePrefix,
  blockTimeout: 100,
  // Production ranks recovered jobs; the worker's own promotion pass releases them, so keep it short.
  promotionInterval: 100,
}

// Rank 1 is the lowest rank the ranked background queue accepts; recovery does not exercise priority ordering.
const seedOptions = (authorizationId: string) => ({
  jobId: authorizationId,
  attempts: 1,
  removeOnComplete: 100,
  removeOnFail: 100,
  priority: 1,
  ordering: { key: 'oauth-authorization-exchange' },
  deduplication: { id: authorizationId, mode: 'simple' as const },
})

type ExchangeJob = Job<OAuthAuthorizationExchangeJobData>

describe('OAuth authorization exchange recovery through real GlideMQ', () => {
  const workers: Worker<OAuthAuthorizationExchangeJobData>[] = []

  afterEach(async () => {
    vi.restoreAllMocks()
    await Promise.allSettled(workers.splice(0).map(worker => worker.close()))
    await background.obliterate({ force: true })
  })

  const startWorker = async (
    processor: (job: ExchangeJob) => Promise<void>,
    onTerminal: (job: ExchangeJob, state: 'completed' | 'failed') => void,
  ) => {
    const worker = new Worker<OAuthAuthorizationExchangeJobData>(
      background.name,
      processor,
      workerOptions,
    )
    workers.push(worker)
    worker.on('error', () => undefined)
    worker.on('completed', job => onTerminal(job, 'completed'))
    worker.on('failed', job => {
      if (job) onTerminal(job, 'failed')
    })
    await worker.waitUntilReady()
    return worker
  }

  // Seeds one job per entry, runs a worker until each is terminal, and returns the live jobs.
  const seedTerminalJobs = async (
    seeds: { id: string; name?: string; fail?: boolean }[],
    executionCounts: Map<string, number>,
  ) => {
    const settled = Promise.withResolvers<void>()
    const states = new Map<string, string>()
    const worker = await startWorker(
      async job => {
        executionCounts.set(job.id, (executionCounts.get(job.id) ?? 0) + 1)
        if (seeds.find(seed => seed.id === job.id)?.fail) {
          throw new Error('expected terminal exchange failure')
        }
      },
      (job, state) => {
        if (!seeds.some(seed => seed.id === job.id)) return
        states.set(job.id, state)
        if (states.size === seeds.length) settled.resolve()
      },
    )
    const jobs = await Promise.all(
      seeds.map(seed =>
        background.add(
          seed.name ?? OAUTH_AUTHORIZATION_EXCHANGE_JOB.name,
          { authorizationId: seed.id },
          seedOptions(seed.id),
        ),
      ),
    )
    await settled.promise
    await worker.close()
    workers.splice(workers.indexOf(worker), 1)
    return jobs.map(job => {
      if (!job) throw new Error('Expected terminal exchange test job to be created')
      return job
    })
  }

  it('reactivates matching completed and failed stable IDs without touching unrelated jobs', async () => {
    const completedAuthorizationId = randomUUID()
    const failedAuthorizationId = randomUUID()
    const unrelatedAuthorizationId = randomUUID()
    const executionCounts = new Map<string, number>()
    const [completedJob, failedJob, unrelatedJob] = await seedTerminalJobs(
      [
        { id: completedAuthorizationId },
        { id: failedAuthorizationId, fail: true },
        { id: unrelatedAuthorizationId },
      ],
      executionCounts,
    )
    await expect(completedJob.getState()).resolves.toBe('completed')
    await expect(failedJob.getState()).resolves.toBe('failed')
    await expect(unrelatedJob.getState()).resolves.toBe('completed')

    await expect(
      enqueueOrReactivateBulkOAuthAuthorizationExchanges([
        { authorizationId: completedAuthorizationId },
        { authorizationId: failedAuthorizationId },
      ]),
    ).resolves.toBe(1)

    const recovered = Promise.withResolvers<void>()
    const recoveredIds = new Set<string>()
    await startWorker(
      async job => {
        executionCounts.set(job.id, (executionCounts.get(job.id) ?? 0) + 1)
      },
      job => {
        if (job.id !== completedAuthorizationId && job.id !== failedAuthorizationId) return
        recoveredIds.add(job.id)
        if (recoveredIds.size === 2) recovered.resolve()
      },
    )
    await recovered.promise
    expect(executionCounts.get(completedAuthorizationId)).toBe(2)
    expect(executionCounts.get(failedAuthorizationId)).toBe(2)
    await expect(unrelatedJob.getState()).resolves.toBe('completed')
    expect(executionCounts.get(unrelatedAuthorizationId)).toBe(1)
  })

  it('does not inspect queue state for an empty durable recovery page', async () => {
    const getJob = vi.spyOn(background, 'getJob')
    const addBulk = vi.spyOn(background, 'addBulk')

    await expect(enqueueOrReactivateBulkOAuthAuthorizationExchanges([])).resolves.toBe(0)

    expect(getJob).not.toHaveBeenCalled()
    expect(addBulk).not.toHaveBeenCalled()
  })

  it('preserves a completed job whose name is not the exchange job', async () => {
    const authorizationId = randomUUID()
    await seedTerminalJobs(
      [{ id: authorizationId, name: OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_JOB.name }],
      new Map(),
    )
    const remove = vi.spyOn(Job.prototype, 'remove')

    await expect(
      enqueueOrReactivateBulkOAuthAuthorizationExchanges([{ authorizationId }]),
    ).resolves.toBe(0)

    expect(remove).not.toHaveBeenCalled()
    const retained = await background.getJob(authorizationId)
    expect(retained?.name).toBe(OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_JOB.name)
    await expect(retained?.getState()).resolves.toBe('completed')
  })

  it('aborts recovery enqueue when completed-job removal fails', async () => {
    const authorizationId = randomUUID()
    await seedTerminalJobs([{ id: authorizationId }], new Map())
    vi.spyOn(Job.prototype, 'remove').mockRejectedValueOnce(new Error('remove failed'))
    const addBulk = vi.spyOn(background, 'addBulk')

    await expect(
      enqueueOrReactivateBulkOAuthAuthorizationExchanges([{ authorizationId }]),
    ).rejects.toThrow('remove failed')

    expect(addBulk).not.toHaveBeenCalled()
    await expect((await background.getJob(authorizationId))?.getState()).resolves.toBe('completed')
  })
})
// The admin backfill and manual triggers reuse one logical dispatcher id, so a later trigger must
// start a new pass once the previous one is done however it ended.
describe('OAuth exchange dispatcher enqueue through real GlideMQ', () => {
  // This is the file's last suite; the queue lives in its private `voucha_qdb_<n>` namespace.
  afterAll(() => closeAndUnregisterGlideMQInstance(background))

  // The throttle window is wall-clock time: dropping its ttl lets the replay isolate the job-id
  // claim, which is the part that used to outlive the job. Zero priority skips the scheduler's ~5s
  // promotion of prioritized jobs, and one attempt avoids waiting out a retry backoff.
  const productionOptions = async (deduplicationId: string) => {
    await enqueueOAuthAuthorizationExchangeDispatcher({ deduplicationId })
    const jobs = await readAllQueueJobs(oauthAuthorizationExchangeQueue)
    const observed = jobs.find(
      job =>
        job.name === OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_JOB.name &&
        job.opts.deduplication?.id === deduplicationId,
    )
    if (!observed?.opts.deduplication) throw new Error('Expected public dispatcher enqueue')
    const { deduplication, ...options } = observed.opts
    await observed.remove()
    return {
      ...ENQUEUE_BASE_DEFAULTS,
      ...options,
      deduplication: { id: deduplication.id, mode: deduplication.mode },
      attempts: 1,
      priority: 0,
    }
  }

  it.each(['complete', 'fail'] as const)(
    'accepts a repeat trigger after the previous pass %s with its record retained',
    async outcome => {
      const lifecycle = await startRealGlideJobLifecycle<Record<string, never>>(
        'oauth_dispatcher',
        { connection: workerQueueConnection, prefix: workerQueuePrefix },
      )
      const options = await productionOptions(
        `backfill:oauth-authorization-exchange-dispatch:${randomUUID()}`,
      )
      try {
        lifecycle.setOutcome(outcome)
        const first = await lifecycle.queue.add(
          OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_JOB.name,
          {},
          options,
        )
        if (!first) throw new Error('Expected the first dispatcher pass to be created')
        await expect(lifecycle.settled(first)).resolves.toBe(
          outcome === 'complete' ? 'completed' : 'failed',
        )
        await expect(lifecycle.queue.getJob(first.id)).resolves.not.toBeNull()

        lifecycle.setOutcome('complete')
        const second = await lifecycle.queue.add(
          OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_JOB.name,
          {},
          options,
        )
        expect(second).not.toBeNull()
        expect(second?.id).not.toBe(first.id)
        await expect(lifecycle.settled(second!)).resolves.toBe('completed')
      } finally {
        await lifecycle.close()
      }
    },
  )
})
