import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { ai_agents } from '../queues.mts'
import type { PostClassifierJobData } from '../types.mts'
import { enqueueBulkPostClassifiers, enqueuePostClassifier } from './post-classifier.mts'

describe('post classifier enqueue', () => {
  it('keeps a durable receipt job retryable after queue attempt exhaustion', async () => {
    const applicationId = randomUUID()

    await enqueuePostClassifier({
      applicationId,
      postId: randomUUID(),
      inputSha256: Buffer.alloc(32, 1).toString('hex'),
      configurationSha256: Buffer.alloc(32, 2).toString('hex'),
      detectorPackageVersion: '0.4.3',
    })

    const job = (await readAllQueueJobs(ai_agents)).find(
      candidate =>
        candidate.name === 'post-classifier' &&
        (candidate.data as PostClassifierJobData).applicationId === applicationId,
    )
    expect(job?.opts).toMatchObject({
      attempts: 3,
      removeOnComplete: true,
      removeOnFail: true,
      jobId: `post_classifier_${applicationId}`,
    })
  })

  it('adds a recovery batch as post-classifier children with independent receipt identities', async () => {
    const items = [
      {
        applicationId: randomUUID(),
        postId: randomUUID(),
        inputSha256: Buffer.alloc(32, 3).toString('hex'),
        configurationSha256: Buffer.alloc(32, 4).toString('hex'),
        detectorPackageVersion: '0.4.3',
      },
      {
        applicationId: randomUUID(),
        postId: randomUUID(),
        inputSha256: Buffer.alloc(32, 5).toString('hex'),
        configurationSha256: Buffer.alloc(32, 6).toString('hex'),
        detectorPackageVersion: '0.4.3',
      },
    ]

    await enqueueBulkPostClassifiers(items)

    const jobs = await readAllQueueJobs(ai_agents)
    expect(
      jobs
        .filter(job => job.name === 'post-classifier')
        .map(job => (job.data as PostClassifierJobData).applicationId)
        .filter((applicationId): applicationId is string =>
          items.some(item => item.applicationId === applicationId),
        )
        .sort(),
    ).toEqual(items.map(item => item.applicationId).sort())
  })
})
