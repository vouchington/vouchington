import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { ai_agents } from '../queues.mts'
import type { PostClassifierJobData } from '../types.mts'
import {
  enqueueBulkPostClassifiers,
  enqueuePostClassifier,
  enqueuePostClassifierDispatcher,
} from './post-classifier.mts'
import { enqueueReconcilePostClassifierApplications } from './reconcile-post-classifier-applications.mts'

describe('post classifier enqueue', () => {
  it('enqueues post dispatch and receipt reconciliation with their worker job names', async () => {
    const postId = randomUUID()
    await enqueuePostClassifierDispatcher(postId)
    const reconciliation = await enqueueReconcilePostClassifierApplications()
    if (!reconciliation) throw new Error('Expected a reconciliation job')
    const jobs = await readAllQueueJobs(ai_agents)
    expect(jobs).toContainEqual(
      expect.objectContaining({
        name: 'post-classifier-dispatcher',
        data: { postId },
      }),
    )
    expect(jobs).toContainEqual(
      expect.objectContaining({
        id: reconciliation.id,
        name: 'reconcile-post-classifier-applications',
        data: {},
      }),
    )
  })
  it('keeps a durable receipt job retryable after queue attempt exhaustion', async () => {
    const applicationId = randomUUID()

    await enqueuePostClassifier({
      applicationId,
      postId: randomUUID(),
      inputSha256: Buffer.alloc(32, 1).toString('hex'),
      configurationSha256: Buffer.alloc(32, 2).toString('hex'),
      detectorPackageVersion: '0.0.0-test',
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
        detectorPackageVersion: '0.0.0-test',
      },
      {
        applicationId: randomUUID(),
        postId: randomUUID(),
        inputSha256: Buffer.alloc(32, 5).toString('hex'),
        configurationSha256: Buffer.alloc(32, 6).toString('hex'),
        detectorPackageVersion: '0.0.0-test',
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
