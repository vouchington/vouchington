import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { QUEUE_NAME } from '@queues/activitypub/config'
import {
  prepareActivityDistributionPage,
  releaseActivityDistributionPage,
} from '@services/activitypub-delivery'
import { updateUserFields } from '@services/users'
import { createTestUserDirect } from '@voucha/test-helpers'
import { processActivityPubJob } from './processors.mts'

// This project passes through the external transport and runs the actual merged dispatcher.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('activitypub distribution lease deferral', () => {
  it('delays a distribution job while its durable page lease is held', async () => {
    const source = await createTestUserDirect()
    const target = await createTestUserDirect()
    await updateUserFields(source.id, { is_fediverse_federation_enabled: true })
    await updateUserFields(target.id, { is_fediverse_federation_enabled: true })
    const activityId = randomUUID()
    const page = await prepareActivityDistributionPage(activityId, source.id)
    if (page.status !== 'ready') throw new Error('Expected to claim a distribution page')

    const prefix = `${workerQueuePrefix}-activitypub-busy-${randomUUID()}`
    const queue = new Queue(QUEUE_NAME, { connection: workerQueueConnection, prefix })
    let worker: Worker | undefined
    const settled = Promise.withResolvers<void>()
    try {
      const job = await queue.add(
        'distributeActivity',
        { activityId, activityType: 'Follow', sourceUserId: source.id, targetUserId: target.id },
        { priority: 10, attempts: 5 },
      )
      if (!job) throw new Error('Expected distribution job to enqueue')
      worker = new Worker(QUEUE_NAME, processActivityPubJob, {
        connection: workerQueueConnection,
        prefix,
        concurrency: 1,
        blockTimeout: 1000,
      })
      worker.on('error', error => settled.reject(error))
      worker.on('failed', (_failed, error) => settled.reject(error))
      worker.on('completed', () => settled.reject(new Error('Busy distribution completed')))
      worker.on('active', active => {
        if (active.id === job.id) worker?.once('drained', () => settled.resolve())
      })
      await settled.promise
      const delayed = await queue.getJob(job.id)
      expect(await delayed?.getState()).toBe('delayed')
      expect(delayed?.attemptsMade).toBe(0)
      await expect(prepareActivityDistributionPage(activityId, source.id)).resolves.toMatchObject({
        status: 'busy',
      })
    } finally {
      await worker?.close()
      await queue.obliterate({ force: true })
      await queue.close()
      await releaseActivityDistributionPage(activityId, page.leaseToken)
    }
  })
})

async function runIsolatedJob(name: string, data: Record<string, unknown>): Promise<unknown> {
  const prefix = `${workerQueuePrefix}-activitypub-worker-${randomUUID()}`
  const queue = new Queue(QUEUE_NAME, { connection: workerQueueConnection, prefix })
  let worker: Worker | undefined
  const outcome = Promise.withResolvers<unknown>()
  try {
    const job = await queue.add(name, data, { attempts: 1, priority: 10 })
    if (!job) throw new Error(`Expected ${name} to enqueue`)
    worker = new Worker(QUEUE_NAME, (current: Job) => processActivityPubJob(current), {
      connection: workerQueueConnection,
      prefix,
      concurrency: 1,
      blockTimeout: 1000,
    })
    worker.on('error', error => outcome.reject(error))
    worker.on('failed', (failed, error) => {
      if (failed.id === job.id) outcome.reject(error)
    })
    worker.on('completed', (completed, result) => {
      if (completed.id === job.id) outcome.resolve(result)
    })
    return await outcome.promise
  } finally {
    await worker?.close()
    await queue.obliterate({ force: true })
    await queue.close()
  }
}

describe('activitypub dispatcher on an isolated real queue', () => {
  it('rejects unknown jobs', async () => {
    await expect(runIsolatedJob('missingJob', {})).rejects.toThrow(
      'Unknown ActivityPub inbox job: missingJob',
    )
  })

  it('runs a delivery job through its processor', async () => {
    await expect(
      runIsolatedJob('deliverActivity', {
        activityId: randomUUID(),
        activityType: 'Accept',
        sourceUserId: randomUUID(),
        inboxUrl: 'https://remote.example.test/inbox',
        followActivityId: randomUUID(),
        followActorUri: 'https://remote.example.test/actor',
      }),
    ).resolves.toEqual({ delivered: false, reason: 'federation-disabled' })
  })
})
