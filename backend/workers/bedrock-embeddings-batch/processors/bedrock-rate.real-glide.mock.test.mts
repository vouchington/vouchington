import { randomUUID } from 'node:crypto'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { Worker, type Job } from 'glide-mq'
import { UnrecoverableError } from '@vouchington/queue-errors'
import { withBedrockRateLimit } from '@workers/bedrock-embeddings-batch/processors/bedrock-rate'
import { getCpuProviderCooldownRemainingMs } from '@services/bedrock-embeddings/provider-cooldown'
import { createOwnedEmbeddingQueueWithoutQuota } from '@voucha/test-helpers/embedding-creation-events'
import { runBedrockJobWithProviderCooldown } from '@workers/bedrock-embeddings/processors/provider-cooldown'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('Bedrock errors on the shared CPU worker', () => {
  it('returns successful provider work', async () => {
    await expect(withBedrockRateLimit(async () => 'completed')).resolves.toBe('completed')
  })

  it('turns Bedrock throttling into a job-scoped deferral signal', async () => {
    const throttle = Object.assign(new Error('Bedrock request throttled'), {
      name: 'ThrottlingException',
      $metadata: { httpStatusCode: 429 },
    })
    const outcome: unknown = await withBedrockRateLimit(async () => {
      throw throttle
    }).catch((err: unknown) => err)
    expect(outcome).toBeInstanceOf(Worker.RateLimitError)
    expect(outcome).toMatchObject({
      delayMs: 60_000,
      cause: throttle,
    })
  })

  it('fails a permanent provider request without retrying', async () => {
    const invalid = Object.assign(new Error('Invalid model request'), {
      $metadata: { httpStatusCode: 400 },
    })
    await expect(
      withBedrockRateLimit(async () => {
        throw invalid
      }),
    ).rejects.toBeInstanceOf(UnrecoverableError)
  })

  it('keeps a transient provider failure retryable', async () => {
    const unavailable = Object.assign(new Error('Bedrock unavailable'), {
      $metadata: { httpStatusCode: 503 },
    })
    await expect(
      withBedrockRateLimit(async () => {
        throw unavailable
      }),
    ).rejects.toBe(unavailable)
  })
})

describe('native embedding creation provider cooldown', () => {
  it('persists a Bedrock throttle and defers later work in the same provider lane', async () => {
    const owned = createOwnedEmbeddingQueueWithoutQuota('provider_cooldown', {
      connection: workerQueueConnection,
      prefix: `${workerQueuePrefix}-embedding-creation-cooldown-${randomUUID()}`,
    })
    const groupKey = `bedrock-embeddings:creation:test:${randomUUID()}`
    const started: string[] = []
    const throttle = Object.assign(new Error('Bedrock request throttled'), {
      name: 'ThrottlingException',
      $metadata: { httpStatusCode: 429 },
    })

    await owned.run(async () => {
      await owned.ready()
      const worker = await owned.createWorker(
        () =>
          new Worker(
            owned.queue.name,
            (job: Job) =>
              runBedrockJobWithProviderCooldown(job, groupKey, () =>
                withBedrockRateLimit(async () => {
                  started.push(job.name)
                  if (job.name === 'provider.first') throw throttle
                  return { completed: job.name }
                }),
              ),
            { ...owned.options, concurrency: 1, blockTimeout: 100 },
          ),
      )
      await worker.waitUntilReady()

      const first = await owned.add('provider.first', {})
      const second = await owned.add('provider.second', {})
      if (!first || !second) throw new Error('Expected both provider cooldown jobs')
      await Promise.all([
        owned.waitFor(first.id, 'delay-changed'),
        owned.waitFor(second.id, 'delay-changed'),
      ])

      const delayedFirst = await owned.queue.getJob(first.id)
      const delayedSecond = await owned.queue.getJob(second.id)
      expect(await delayedFirst?.getState()).toBe('delayed')
      expect(await delayedSecond?.getState()).toBe('delayed')
      expect(delayedFirst?.attemptsMade).toBe(0)
      expect(delayedSecond?.attemptsMade).toBe(0)
      expect(started).toEqual(['provider.first'])
      expect(await getCpuProviderCooldownRemainingMs(groupKey)).toBeGreaterThan(1_000)
    })
  })

  it('keeps ungrouped Bedrock throttles job-local without creating shared cooldown state', async () => {
    const owned = createOwnedEmbeddingQueueWithoutQuota('provider_cooldown_ungrouped', {
      connection: workerQueueConnection,
      prefix: `${workerQueuePrefix}-embedding-creation-ungrouped-${randomUUID()}`,
    })
    const started: string[] = []
    const throttle = Object.assign(new Error('Bedrock request throttled'), {
      name: 'ThrottlingException',
      $metadata: { httpStatusCode: 429 },
    })

    await owned.run(async () => {
      await owned.ready()
      const worker = await owned.createWorker(
        () =>
          new Worker(
            owned.queue.name,
            (job: Job) =>
              runBedrockJobWithProviderCooldown(job, undefined, () =>
                withBedrockRateLimit(async () => {
                  started.push(job.name)
                  throw throttle
                }),
              ),
            { ...owned.options, concurrency: 1, blockTimeout: 100 },
          ),
      )
      await worker.waitUntilReady()
      const job = await owned.add('provider.ungrouped', {})
      if (!job) throw new Error('Expected ungrouped Bedrock work')
      await owned.waitFor(job.id, 'delay-changed')

      const delayed = await owned.queue.getJob(job.id)
      expect(await delayed?.getState()).toBe('delayed')
      expect(delayed?.groupKey).toBeUndefined()
      expect(delayed?.attemptsMade).toBe(0)
      expect(started).toEqual(['provider.ungrouped'])
    })
  })
})
