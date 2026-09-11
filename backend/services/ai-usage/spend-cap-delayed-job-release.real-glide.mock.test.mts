import { randomUUID } from 'node:crypto'
import { Queue, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import {
  workerQueueCommandClient,
  workerQueueConnection,
  workerQueuePrefix,
} from '@data-stores/valkey-glide-mq'
import {
  beginOpenAiSpendCapDelayedJobRelease,
  openAiSpendCapDelayedRegistryKey,
  registerOpenAiSpendCapDelayedJob,
  releaseOpenAiSpendCapDelayedJobs,
} from '@services/ai-usage'

vi.mock<typeof import('glide-mq')>(
  import('glide-mq'),
  async importOriginal => await importOriginal(),
)

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
const AI_AGENTS_QUEUE_NAME = 'ai_agents'
type SpendCapTestJobData = { openAiSpendCapDelayedDay?: string }

describe('OpenAI spend-cap atomic promotion with real GlideMQ', () => {
  it('keeps an idempotent registration marked without replaying its job data write', async () => {
    const day = `test-${randomUUID()}`
    const registryKey = openAiSpendCapDelayedRegistryKey(day)
    const updateData = vi
      .fn<(data: SpendCapTestJobData) => Promise<void>>()
      .mockResolvedValue(undefined)
    const job = {
      id: randomUUID(),
      data: {},
      updateData,
    } as unknown as Job<SpendCapTestJobData>

    try {
      const firstRegistration = await registerOpenAiSpendCapDelayedJob(job, day)
      expect(firstRegistration).toMatchObject({ accepted: true })
      expect(firstRegistration.alreadyMarked).toBeUndefined()
      await expect(workerQueueCommandClient.hget(registryKey, `job:${job.id}`)).resolves.toBe(
        'marked',
      )
      updateData.mockRejectedValueOnce(new Error('idempotent retry must not write'))

      await expect(registerOpenAiSpendCapDelayedJob(job, day)).resolves.toMatchObject({
        accepted: true,
        generation: firstRegistration.generation,
        alreadyMarked: true,
      })
      expect(updateData).toHaveBeenCalledTimes(1)
      await expect(workerQueueCommandClient.hget(registryKey, `job:${job.id}`)).resolves.toBe(
        'marked',
      )
      await expect(
        beginOpenAiSpendCapDelayedJobRelease(day, firstRegistration.generation),
      ).resolves.toEqual(expect.any(String))
    } finally {
      await workerQueueCommandClient.unlink([registryKey])
    }
  })

  it('atomically stages a page of priority jobs for numeric scheduling', async () => {
    const day = `test-${randomUUID()}`
    const registryKey = openAiSpendCapDelayedRegistryKey(day)
    const queue = new Queue<SpendCapTestJobData>(AI_AGENTS_QUEUE_NAME, connection)
    const jobs: Job<SpendCapTestJobData>[] = []
    const batchInvocationKeyCounts: number[] = []
    const batchInvocationArgCounts: number[] = []
    const registry = {
      hlen: async (...args: Parameters<typeof workerQueueCommandClient.hlen>) =>
        await workerQueueCommandClient.hlen(...args),
      hscan: async (...args: Parameters<typeof workerQueueCommandClient.hscan>) =>
        await workerQueueCommandClient.hscan(...args),
      invokeScript: async (...args: Parameters<typeof workerQueueCommandClient.invokeScript>) => {
        const options = args[1]
        if (!options) throw new Error('Expected Valkey script options')
        batchInvocationKeyCounts.push(options.keys?.length ?? 0)
        batchInvocationArgCounts.push(options.args?.length ?? 0)
        return await workerQueueCommandClient.invokeScript(...args)
      },
    }

    try {
      const firstJob = await queue.add(
        `spend-cap-release-test-${randomUUID()}`,
        {},
        {
          jobId: randomUUID(),
          priority: 1,
        },
      )
      const secondJob = await queue.add(
        `spend-cap-release-test-${randomUUID()}`,
        {},
        {
          jobId: randomUUID(),
          priority: 100,
        },
      )
      if (!firstJob || !secondJob) throw new Error('Expected priority promotion jobs')
      jobs.push(firstJob, secondJob)
      const registration = await registerOpenAiSpendCapDelayedJob(firstJob, day)
      await expect(registerOpenAiSpendCapDelayedJob(secondJob, day)).resolves.toMatchObject({
        accepted: true,
      })
      await Promise.all(jobs.map(job => job.changeDelay(60 * 60 * 1000)))
      const lease = await beginOpenAiSpendCapDelayedJobRelease(day, registration.generation)
      if (!lease) throw new Error('Expected release lease')

      await expect(releaseOpenAiSpendCapDelayedJobs(day, lease, queue, registry)).resolves.toEqual({
        released: 2,
        hasPending: false,
        cursor: '0',
      })
      expect(batchInvocationKeyCounts).toEqual([7])
      expect(batchInvocationArgCounts).toEqual([6])
      await expect(Promise.all(jobs.map(job => job.getState()))).resolves.toEqual([
        'prioritized',
        'prioritized',
      ])
      const scheduledKey = `${workerQueuePrefix ?? 'glide'}:{${AI_AGENTS_QUEUE_NAME}}:scheduled`
      const [firstScore, secondScore] = await Promise.all(
        jobs.map(job => workerQueueCommandClient.zscore(scheduledKey, job.id)),
      )
      if (firstScore === null || secondScore === null) {
        throw new Error('Expected priority promotion scores')
      }
      expect(firstScore).toBe(4_398_046_511_104)
      expect(secondScore).toBe(439_804_651_110_400)
      expect(firstScore).toBeLessThan(secondScore)
      await expect(
        Promise.all(jobs.map(job => workerQueueCommandClient.hget(registryKey, `job:${job.id}`))),
      ).resolves.toEqual([null, null])
    } finally {
      try {
        await workerQueueCommandClient.unlink([registryKey])
      } finally {
        try {
          for (const job of jobs) {
            const current = await queue.getJob(job.id)
            if (current) await current.remove()
          }
        } finally {
          await queue.close()
        }
      }
    }
  })

  it('does not promote a job whose delay day advanced after classification', async () => {
    const day = `test-${randomUUID()}`
    const newerDay = `test-${randomUUID()}`
    const registryKey = openAiSpendCapDelayedRegistryKey(day)
    const queue = new Queue<SpendCapTestJobData>(AI_AGENTS_QUEUE_NAME, connection)
    let job: Job<SpendCapTestJobData> | undefined
    const registry = {
      hlen: async (...args: Parameters<typeof workerQueueCommandClient.hlen>) =>
        await workerQueueCommandClient.hlen(...args),
      hscan: async (...args: Parameters<typeof workerQueueCommandClient.hscan>) =>
        await workerQueueCommandClient.hscan(...args),
      invokeScript: async (...args: Parameters<typeof workerQueueCommandClient.invokeScript>) => {
        const options = args[1]
        if (options?.keys?.some(key => String(key).endsWith(':scheduled')) && job) {
          await job.updateData({ ...job.data, openAiSpendCapDelayedDay: newerDay })
        }
        return await workerQueueCommandClient.invokeScript(...args)
      },
    }

    try {
      const created = await queue.add(
        `spend-cap-release-test-${randomUUID()}`,
        {},
        { jobId: randomUUID() },
      )
      if (!created) throw new Error('Expected midnight-race promotion job')
      job = created
      const registration = await registerOpenAiSpendCapDelayedJob(job, day)
      await job.changeDelay(60 * 60 * 1000)
      const lease = await beginOpenAiSpendCapDelayedJobRelease(day, registration.generation)
      if (!lease) throw new Error('Expected release lease')

      await expect(releaseOpenAiSpendCapDelayedJobs(day, lease, queue, registry)).resolves.toEqual({
        released: 0,
        hasPending: true,
        cursor: '0',
      })
      await expect(job.getState()).resolves.toBe('delayed')
      expect(job.data.openAiSpendCapDelayedDay).toBe(newerDay)
      await expect(workerQueueCommandClient.hget(registryKey, `job:${job.id}`)).resolves.toBe(
        'marked',
      )
    } finally {
      try {
        await workerQueueCommandClient.unlink([registryKey])
      } finally {
        try {
          if (job) {
            const current = await queue.getJob(job.id)
            if (current) await current.remove()
          }
        } finally {
          await queue.close()
        }
      }
    }
  })
})
