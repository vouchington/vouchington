import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import {
  workerQueueCommandClient,
  workerQueueConnection,
  workerQueuePrefix,
} from '@data-stores/valkey-glide-mq'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import { spendCapRecheckDeduplicationId } from '@queues/ai-agents/enqueues/spend-cap-recheck'
import { spendCapRechecks } from '@queues/ai-agents/queues'
import {
  processSpendCapRecheckJob,
  registerSpendCapRecheck,
} from '../processors/spend-cap-recheck.mts'
import { spendCapDelayedRegistryKey, releaseSpendCapDelayedJobs } from '@services/ai-usage'

// This project deliberately restores real GlideMQ instead of the default in-memory worker shim.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('daily AI spend-cap coordination with real GlideMQ', () => {
  it('drops missing and stale registry entries while draining', async () => {
    const queueName = `ai_agents_spend_cap_cleanup_${randomUUID()}`
    const day = `test-${randomUUID()}`
    const registryKey = spendCapDelayedRegistryKey(day)
    const queue = new Queue<AIAgentJobData>(queueName, connection)
    try {
      const staleJob = await queue.add('report-judgement', {
        spendCapDelayedDay: `other-${randomUUID()}`,
      } as AIAgentJobData)
      if (!staleJob) throw new Error('Expected stale spend-cap job')
      await workerQueueCommandClient.hset(registryKey, {
        __generation: 'generation-a',
        __mode: 'releasing',
        __release_lease: 'lease-a',
        'job:missing': 'marked',
        [`job:${staleJob.id}`]: 'marked',
      })
      await expect(releaseSpendCapDelayedJobs(day, 'lease-a', queue)).resolves.toEqual({
        released: 0,
        hasPending: false,
        cursor: '0',
      })
      await expect(workerQueueCommandClient.hlen(registryKey)).resolves.toBe(3)
    } finally {
      await workerQueueCommandClient.unlink([registryKey])
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it('registers a real agent job and enqueues its dedicated coordinator', async () => {
    const queueName = `ai_agents_spend_cap_register_${randomUUID()}`
    const day = `${1_000 + Math.floor(Math.random() * 1_000)}-08-16`
    const registryKey = spendCapDelayedRegistryKey(day)
    const queue = new Queue<AIAgentJobData>(queueName, connection)
    try {
      const job = await queue.add('report-judgement', {} as AIAgentJobData)
      if (!job) throw new Error('Expected spend-cap registration job')
      await expect(registerSpendCapRecheck(job, day, Date.now())).resolves.toBe(true)
      expect(job.data.spendCapDelayedDay).toBe(day)
    } finally {
      const coordinators = await spendCapRechecks.getJobs('waiting')
      await Promise.all(
        coordinators
          .filter(candidate => candidate.data.day === day)
          .map(candidate => candidate.remove()),
      )
      await workerQueueCommandClient.unlink([registryKey])
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
  it('uses the production release drain when a coordinator owns a release lease', async () => {
    const day = `${3_000 + Math.floor(Math.random() * 6_000)}-08-16`
    const registryKey = spendCapDelayedRegistryKey(day)
    const job = {
      data: { day, generation: `generation-${randomUUID()}` },
      moveToDelayed: async () => undefined,
      updateData: async () => undefined,
    } as unknown as Job<{ day: string; generation: string }>
    try {
      await expect(
        processSpendCapRecheckJob(job, {
          waitForSpendCapConfig: async () => undefined,
          getSpendCapFields: () => ({ enabled: false, daily_cap_microunits: 1 }),
          beginSpendCapDelayedJobRelease: async () => 'lease-a',
          completeSpendCapDelayedJobRelease: async () => true,
        }),
      ).resolves.toBeUndefined()
    } finally {
      await workerQueueCommandClient.unlink([registryKey])
    }
  })
  it('runs a dedicated coordinator while the spend queue is RPM-limited', async () => {
    const spendQueueName = `spend_limited_${randomUUID()}`
    const coordinatorQueueName = `spend_recheck_${randomUUID()}`
    const spendQueue = new Queue(spendQueueName, connection)
    const coordinatorQueue = new Queue(coordinatorQueueName, connection)
    const processedSpendIds: string[] = []
    const processedCoordinatorIds: string[] = []
    const spendProcessed = Promise.withResolvers<void>()
    const coordinatorProcessed = Promise.withResolvers<void>()
    const spendWorker = new Worker(
      spendQueueName,
      async (job: Job) => {
        processedSpendIds.push(job.id)
        spendProcessed.resolve()
      },
      { ...connection, blockTimeout: 1000, limiter: { max: 1, duration: 60_000 } },
    )
    const coordinatorWorker = new Worker(
      coordinatorQueueName,
      async (job: Job) => {
        processedCoordinatorIds.push(job.id)
        coordinatorProcessed.resolve()
      },
      { ...connection, blockTimeout: 1000 },
    )

    try {
      const first = await spendQueue.add('spend', {})
      await spendQueue.add('spend', {})
      const coordinator = await coordinatorQueue.add('recheck', {})
      if (!first || !coordinator) throw new Error('Expected limiter test jobs')

      await spendProcessed.promise
      await coordinatorProcessed.promise
      expect(processedSpendIds).toContain(first.id)
      expect(processedCoordinatorIds).toContain(coordinator.id)
      expect(processedSpendIds).toHaveLength(1)
    } finally {
      await Promise.all([spendWorker.close(true), coordinatorWorker.close(true)])
      await Promise.all([
        spendQueue.obliterate({ force: true }),
        coordinatorQueue.obliterate({ force: true }),
      ])
      await Promise.all([spendQueue.close(), coordinatorQueue.close()])
    }
  })

  it('accepts a successor generation while the prior coordinator is active', async () => {
    const queueName = `spend_recheck_generation_${randomUUID()}`
    const day = `test-${randomUUID()}`
    const queue = new Queue(queueName, connection)
    let releasePriorCoordinator: (() => void) | undefined
    const priorCoordinatorReleased = new Promise<void>(resolve => {
      releasePriorCoordinator = resolve
    })
    let markPriorCoordinatorActive: (() => void) | undefined
    const priorCoordinatorActive = new Promise<void>(resolve => {
      markPriorCoordinatorActive = resolve
    })
    const worker = new Worker(
      queueName,
      async (job: Job<{ generation: string }>) => {
        if (job.data.generation === 'generation-a') {
          markPriorCoordinatorActive?.()
          await priorCoordinatorReleased
        }
      },
      { ...connection, blockTimeout: 1000 },
    )

    try {
      const priorCoordinator = await queue.add(
        'recheck',
        { generation: 'generation-a' },
        {
          deduplication: {
            id: spendCapRecheckDeduplicationId(day, 'generation-a'),
            mode: 'simple',
          },
        },
      )
      if (!priorCoordinator) throw new Error('Expected prior-generation coordinator')

      await priorCoordinatorActive
      await expect(priorCoordinator.getState()).resolves.toBe('active')

      const successorCoordinator = await queue.add(
        'recheck',
        { generation: 'generation-b' },
        {
          deduplication: {
            id: spendCapRecheckDeduplicationId(day, 'generation-b'),
            mode: 'simple',
          },
        },
      )
      if (!successorCoordinator) throw new Error('Expected successor-generation coordinator')

      expect(successorCoordinator.id).not.toBe(priorCoordinator.id)
      await expect(successorCoordinator.getState()).resolves.toBe('waiting')
    } finally {
      releasePriorCoordinator?.()
      await worker.close(true)
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})
