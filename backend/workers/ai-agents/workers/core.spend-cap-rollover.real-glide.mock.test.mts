import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import {
  workerQueueCommandClient,
  workerQueueConnection,
  workerQueuePrefix,
} from '@data-stores/valkey-glide-mq'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import { AI_AGENTS_QUEUE_NAME } from '@queues/ai-agents/config'
import {
  beginOpenAiSpendCapDelayedJobRelease,
  openAiSpendCapDelayedRegistryKey,
  registerOpenAiSpendCapDelayedJob,
  registerOpenAiSpendCapDelayedJobAfterFreshBreach,
  releaseOpenAiSpendCapDelayedJobs,
} from '@services/ai-usage'

// This project deliberately restores real GlideMQ instead of the default in-memory worker shim.
vi.mock<typeof import('glide-mq')>(
  import('glide-mq'),
  async importOriginal => await importOriginal(),
)

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
function aiAgentsQueue(): Queue<AIAgentJobData> {
  return new Queue(AI_AGENTS_QUEUE_NAME, connection)
}
async function removeOwnedJobs(
  queue: Queue<AIAgentJobData>,
  jobs: Job<AIAgentJobData>[],
): Promise<void> {
  try {
    for (const job of jobs) {
      const current = await queue.getJob(job.id)
      if (current) await current.remove()
    }
  } finally {
    await queue.close()
  }
}

describe('daily OpenAI spend-cap rollover with real GlideMQ', () => {
  it('prevents a revoked lease from releasing a fresh registration', async () => {
    const day = `test-${randomUUID()}`
    const registryKey = openAiSpendCapDelayedRegistryKey(day)
    const queue = aiAgentsQueue()
    const ownedJobs: Job<AIAgentJobData>[] = []

    try {
      const initialJob = await queue.add('chat', {} as AIAgentJobData, { jobId: randomUUID() })
      const delayedJob = await queue.add('chat', {} as AIAgentJobData, { jobId: randomUUID() })
      const freshJob = await queue.add('chat', {} as AIAgentJobData, { jobId: randomUUID() })
      if (!initialJob || !delayedJob || !freshJob) throw new Error('Expected lease test jobs')
      ownedJobs.push(initialJob, delayedJob, freshJob)

      const initialRegistration = await registerOpenAiSpendCapDelayedJob(initialJob, day)
      await expect(registerOpenAiSpendCapDelayedJob(delayedJob, day)).resolves.toMatchObject({
        accepted: true,
      })
      await delayedJob.changeDelay(60 * 60 * 1000)
      const lease = await beginOpenAiSpendCapDelayedJobRelease(day, initialRegistration.generation)
      if (!lease) throw new Error('Expected first release lease')
      await expect(
        registerOpenAiSpendCapDelayedJobAfterFreshBreach(freshJob, day),
      ).resolves.toEqual({
        accepted: true,
        generation: initialRegistration.generation,
      })

      await expect(releaseOpenAiSpendCapDelayedJobs(day, lease, queue)).resolves.toEqual({
        released: 0,
        hasPending: true,
        cursor: '0',
      })
      await expect(delayedJob.getState()).resolves.toBe('delayed')
      await expect(workerQueueCommandClient.hget(registryKey, `job:${freshJob.id}`)).resolves.toBe(
        'marked',
      )
      await expect(workerQueueCommandClient.hlen(registryKey)).resolves.toBe(5)
    } finally {
      try {
        await workerQueueCommandClient.unlink([registryKey])
      } finally {
        await removeOwnedJobs(queue, ownedJobs)
      }
    }
  })

  it('atomically re-registers a fresh breach after release begins', async () => {
    const day = `test-${randomUUID()}`
    const registryKey = openAiSpendCapDelayedRegistryKey(day)
    const queue = aiAgentsQueue()
    const ownedJobs: Job<AIAgentJobData>[] = []

    try {
      const firstJob = await queue.add('chat', {} as AIAgentJobData, { jobId: randomUUID() })
      const freshJob = await queue.add('chat', {} as AIAgentJobData, { jobId: randomUUID() })
      if (!firstJob || !freshJob) throw new Error('Expected re-registration test jobs')
      ownedJobs.push(firstJob, freshJob)

      const firstRegistration = await registerOpenAiSpendCapDelayedJob(firstJob, day)
      expect(firstRegistration.accepted).toBe(true)
      await expect(
        beginOpenAiSpendCapDelayedJobRelease(day, firstRegistration.generation),
      ).resolves.toEqual(expect.any(String))
      await expect(registerOpenAiSpendCapDelayedJob(freshJob, day)).resolves.toEqual({
        accepted: false,
        generation: firstRegistration.generation,
      })

      await expect(
        registerOpenAiSpendCapDelayedJobAfterFreshBreach(freshJob, day),
      ).resolves.toEqual({
        accepted: true,
        generation: firstRegistration.generation,
      })
      expect(freshJob.data.openAiSpendCapDelayedDay).toBe(day)
      await expect(workerQueueCommandClient.hget(registryKey, '__mode')).resolves.toBe('collecting')
      await expect(workerQueueCommandClient.hget(registryKey, `job:${freshJob.id}`)).resolves.toBe(
        'marked',
      )
      await expect(workerQueueCommandClient.hlen(registryKey)).resolves.toBe(4)
      await expect(
        beginOpenAiSpendCapDelayedJobRelease(day, firstRegistration.generation),
      ).resolves.toEqual(expect.any(String))
    } finally {
      try {
        await workerQueueCommandClient.unlink([registryKey])
      } finally {
        await removeOwnedJobs(queue, ownedJobs)
      }
    }
  })

  it('removes only its registering reservation when registration cannot persist the job marker', async () => {
    const day = `test-${randomUUID()}`
    const registryKey = openAiSpendCapDelayedRegistryKey(day)
    const registrationError = new Error('marker persistence failed')
    const markedJob = {
      id: randomUUID(),
      data: {} as AIAgentJobData,
      updateData: vi.fn<(data: AIAgentJobData) => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as Job<AIAgentJobData>
    const job = {
      id: randomUUID(),
      data: {} as AIAgentJobData,
      updateData: vi
        .fn<(data: AIAgentJobData) => Promise<void>>()
        .mockRejectedValue(registrationError),
    } as unknown as Job<AIAgentJobData>

    try {
      await expect(registerOpenAiSpendCapDelayedJob(markedJob, day)).resolves.toMatchObject({
        accepted: true,
      })
      await expect(registerOpenAiSpendCapDelayedJob(job, day)).rejects.toBe(registrationError)
      await expect(workerQueueCommandClient.hlen(registryKey)).resolves.toBe(3)
    } finally {
      await workerQueueCommandClient.unlink([registryKey])
    }
  })

  it('retains MARKED waiting and active jobs before rollover, then removes them as naturally promoted after it', async () => {
    const queueName = `ai_agents_spend_cap_rollover_${randomUUID()}`
    const day = `test-${randomUUID()}`
    const registryKey = openAiSpendCapDelayedRegistryKey(day)
    const queue = new Queue<AIAgentJobData>(queueName, connection)
    let releaseActiveJob: (() => void) | undefined
    const activeJobReleased = new Promise<void>(resolve => {
      releaseActiveJob = resolve
    })
    let markActiveJob: (() => void) | undefined
    const activeJobStarted = new Promise<void>(resolve => {
      markActiveJob = resolve
    })
    const worker = new Worker(
      queueName,
      async (_job: Job<AIAgentJobData>) => {
        markActiveJob?.()
        await activeJobReleased
      },
      connection,
    )

    try {
      const activeJob = await queue.add('chat', {} as AIAgentJobData)
      const waitingJob = await queue.add('chat', {} as AIAgentJobData)
      if (!activeJob || !waitingJob) throw new Error('Expected rollover test jobs')

      const registration = await registerOpenAiSpendCapDelayedJob(activeJob, day)
      expect(registration.accepted).toBe(true)
      await expect(registerOpenAiSpendCapDelayedJob(waitingJob, day)).resolves.toMatchObject({
        accepted: true,
      })
      await activeJobStarted
      await expect(activeJob.getState()).resolves.toBe('active')
      await expect(waitingJob.getState()).resolves.toBe('waiting')
      const lease = await beginOpenAiSpendCapDelayedJobRelease(day, registration.generation)
      if (!lease) throw new Error('Expected release lease')

      await expect(
        releaseOpenAiSpendCapDelayedJobs(day, lease, queue, undefined, '0', false),
      ).resolves.toEqual({
        released: 0,
        hasPending: true,
        cursor: '0',
      })
      await expect(workerQueueCommandClient.hlen(registryKey)).resolves.toBe(5)

      await expect(
        releaseOpenAiSpendCapDelayedJobs(day, lease, queue, undefined, '0', true),
      ).resolves.toEqual({
        released: 0,
        hasPending: false,
        cursor: '0',
      })
      await expect(workerQueueCommandClient.hlen(registryKey)).resolves.toBe(3)
    } finally {
      releaseActiveJob?.()
      await worker.close(true)
      await workerQueueCommandClient.unlink([registryKey])
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it('retains REGISTERING waiting jobs before rollover and removes them after it', async () => {
    const queueName = `ai_agents_spend_cap_registering_${randomUUID()}`
    const day = `test-${randomUUID()}`
    const registryKey = openAiSpendCapDelayedRegistryKey(day)
    const queue = new Queue<AIAgentJobData>(queueName, connection)

    try {
      const markedJob = await queue.add('chat', {} as AIAgentJobData)
      const registeringJob = await queue.add('chat', {
        openAiSpendCapDelayedDay: day,
      } as AIAgentJobData)
      if (!markedJob || !registeringJob) throw new Error('Expected registering test jobs')

      const registration = await registerOpenAiSpendCapDelayedJob(markedJob, day)
      expect(registration.accepted).toBe(true)
      await workerQueueCommandClient.hset(registryKey, {
        [`job:${registeringJob.id}`]: 'registering',
      })
      await expect(registeringJob.getState()).resolves.toBe('waiting')
      const lease = await beginOpenAiSpendCapDelayedJobRelease(day, registration.generation)
      if (!lease) throw new Error('Expected release lease')

      await expect(
        releaseOpenAiSpendCapDelayedJobs(day, lease, queue, undefined, '0', false),
      ).resolves.toEqual({ released: 0, hasPending: true, cursor: '0' })
      await expect(workerQueueCommandClient.hlen(registryKey)).resolves.toBe(5)

      await expect(
        releaseOpenAiSpendCapDelayedJobs(day, lease, queue, undefined, '0', true),
      ).resolves.toEqual({ released: 0, hasPending: false, cursor: '0' })
      await expect(workerQueueCommandClient.hlen(registryKey)).resolves.toBe(3)
    } finally {
      await workerQueueCommandClient.unlink([registryKey])
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})
