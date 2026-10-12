import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job, type JobOptions } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  getTopicRatingStats,
  getTestReportIntegrityFlagsByUserId,
  insertPostElectionVote,
  insertTestModerationReportsForTarget,
  insertTestPostVote,
  insertTestReview,
} from '@voucha/test-helpers'
import { caches } from '@services/entity-cache/caches'
import { getPostElectionById } from '@services/elections-votes/post/get-election'
import { adminSetVoteWeight } from '@services/vote-weight/admin-set'
import { gatherVoteWeightFactors } from '@services/vote-weight/gather-factors'
import { getVoteIntegrityFlags } from '@services/vote-integrity/get-flags'
import { VELOCITY_SPIKE_THRESHOLD } from '@services/vote-integrity/config'
import { MASS_REPORT_THRESHOLD } from '@services/report-integrity/config'
import { QUEUE_NAME } from '@queues/vote-aggregation/config'
import { voteAggregation } from '@queues/vote-aggregation/queues'
import { processVoteAggregationJob } from './processors.mts'

// This project passes through the external transport and runs the actual merged dispatcher.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

type RoutedJob = { name: string; data: Record<string, unknown>; opts: JobOptions }

async function runJobs(jobs: RoutedJob[]): Promise<Set<string>> {
  const prefix = `${workerQueuePrefix}-vote-aggregation-${randomUUID()}`
  const queue = new Queue(QUEUE_NAME, { connection: workerQueueConnection, prefix })
  let worker: Worker | undefined
  const completed = Promise.withResolvers<void>()
  const seen = new Set<string>()
  try {
    await queue.addBulk(jobs)
    worker = new Worker(QUEUE_NAME, processVoteAggregationJob, {
      connection: workerQueueConnection,
      prefix,
      concurrency: 1,
      blockTimeout: 1000,
    })
    worker.on('error', error => completed.reject(error))
    worker.on('failed', (_job, error) => completed.reject(error))
    worker.on('completed', (job: Job) => {
      seen.add(job.name)
      if (seen.size === jobs.length) completed.resolve()
    })
    await completed.promise
    return seen
  } finally {
    await worker?.close()
    await queue.obliterate({ force: true })
    await queue.close()
  }
}

describe('vote-aggregation real worker', () => {
  it('rejects an unknown job name through the real worker', async () => {
    const prefix = `${workerQueuePrefix}-vote-aggregation-unknown-${randomUUID()}`
    const queue = new Queue(QUEUE_NAME, { connection: workerQueueConnection, prefix })
    let worker: Worker | undefined
    const failed = Promise.withResolvers<Error>()
    try {
      const job = await queue.add('unknownVoteAggregationJob', {}, { priority: 10, attempts: 1 })
      if (!job) throw new Error('Expected unknown job to enqueue')
      worker = new Worker(QUEUE_NAME, processVoteAggregationJob, {
        connection: workerQueueConnection,
        prefix,
        concurrency: 1,
        blockTimeout: 1000,
      })
      worker.on('error', error => failed.reject(error))
      worker.on('failed', (rejected, error) => {
        if (rejected?.id === job.id) failed.resolve(error)
      })
      await expect(failed.promise).resolves.toMatchObject({
        message: 'Unknown job name: unknownVoteAggregationJob',
      })
      await expect(job.getState()).resolves.toBe('failed')
    } finally {
      await worker?.close()
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it('routes election, rating, and all metric jobs to durable or cached effects', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({
      hostname: `vote-aggregation-${randomUUID()}.example.com`,
    })
    const post = await createTestPost({ user })
    await insertTestReview({ userId: user.id, topicRatings: [{ topicId: topic.id, rating: 4 }] })
    await insertPostElectionVote(user.id, post.id, 1, undefined, false, true)

    const jobs = [
      {
        name: 'processUpdateElectionVoteStats',
        data: { electionId: post.id, orderingKey: 'post' },
        opts: { priority: 10, ordering: { key: 'post', concurrency: 100 } },
      },
      {
        name: 'processUpdateTopicRatingStats',
        data: { topicId: topic.id },
        opts: { priority: 10 },
      },
      { name: 'processRefreshTopicMetrics', data: { id: topic.id }, opts: { priority: 10 } },
      { name: 'processRefreshPostMetrics', data: { id: post.id }, opts: { priority: 10 } },
      { name: 'processRefreshUserMetrics', data: { id: user.id }, opts: { priority: 10 } },
    ]
    const seen = await runJobs(jobs)
    expect(seen).toEqual(new Set(jobs.map(job => job.name)))
    await expect(getPostElectionById(post.id)).resolves.toMatchObject({ votes_count_up: 1 })
    await expect(getTopicRatingStats(topic.id)).resolves.toMatchObject({ ratings__count__4: 1 })
    await expect(caches.topic_metrics.get(topic.id)).resolves.toMatchObject({ id: topic.id })
    await expect(caches.post_metrics.get(post.id)).resolves.toMatchObject({ id: post.id })
    await expect(caches.user_metrics.get(user.id)).resolves.toMatchObject({ id: user.id })
  })

  it('recalculates a user vote weight and dispatches a later eligible user', async () => {
    const privileged = await createTestUser({ administrator: true })
    await adminSetVoteWeight(privileged.id, privileged.id, 1)
    await runJobs([
      {
        name: 'processRecalculateUserVoteWeight',
        data: { userId: privileged.id, forceRecalculate: true },
        opts: { priority: 10 },
      },
    ])
    await expect(
      gatherVoteWeightFactors(privileged.id, { readFromWriter: true }),
    ).resolves.toMatchObject({
      current_weight: expect.any(Number),
      vote_weight_admin_set_at: null,
    })
    const factors = await gatherVoteWeightFactors(privileged.id, { readFromWriter: true })
    expect(factors?.current_weight).toBeGreaterThan(1)

    const cursor = await createTestUser()
    const target = await createTestUser()
    await runJobs([
      {
        name: 'processRecalculateVoteWeightDispatcher',
        data: { afterId: cursor.id },
        opts: { priority: 100 },
      },
    ])
    const child = (await voteAggregation.getJobs('delayed')).find(
      job =>
        job.name === 'processRecalculateUserVoteWeight' &&
        (job.data as { userId?: string }).userId === target.id,
    )
    expect(child).toBeDefined()
    await child?.remove()
  })

  it('persists a vote-integrity flag from a suspicious burst', async () => {
    const author = await createTestUser()
    const post = await createTestPost({ user: author })
    const voters = await Promise.all(
      Array.from({ length: VELOCITY_SPIKE_THRESHOLD + 1 }, () => createTestUser()),
    )
    await Promise.all(voters.map(voter => insertTestPostVote(post.id, voter.id, '5.6.7.8', 1)))
    await runJobs([
      {
        name: 'processVoteIntegrityCheck',
        data: {
          entityType: 'post',
          entityId: post.id,
          userId: author.id,
          ipAddress: '5.6.7.8',
          score: 1,
        },
        opts: { priority: 10 },
      },
    ])
    const flags = await getVoteIntegrityFlags({ limit: 100 })
    expect(flags.results).toContainEqual(
      expect.objectContaining({ post_id: post.id, flag_type: 'velocity_spike' }),
    )
  })

  it('checks report integrity and backfills a second report target', async () => {
    const target = await createTestUser()
    const reporters = await Promise.all(
      Array.from({ length: MASS_REPORT_THRESHOLD }, () => createTestUser()),
    )
    await insertTestModerationReportsForTarget({
      reporterUserIds: reporters.map(reporter => reporter.id),
      entityType: 'user',
      entityId: target.id,
    })
    await runJobs([
      {
        name: 'processReportIntegrityCheck',
        data: { entityType: 'user', entityId: target.id },
        opts: { priority: 10 },
      },
    ])
    await expect(getTestReportIntegrityFlagsByUserId(target.id)).resolves.toContainEqual(
      expect.objectContaining({ reporter_count: MASS_REPORT_THRESHOLD }),
    )

    const secondTarget = await createTestUser()
    await insertTestModerationReportsForTarget({
      reporterUserIds: reporters.map(reporter => reporter.id),
      entityType: 'user',
      entityId: secondTarget.id,
    })
    await runJobs([{ name: 'backfill_report_integrity', data: {}, opts: { priority: 100 } }])
    const child = (await voteAggregation.getJobs('delayed')).find(
      job =>
        job.name === 'processReportIntegrityCheck' &&
        (job.data as { entityId?: string }).entityId === secondTarget.id,
    )
    expect(child).toBeDefined()
    await child?.remove()
  })
})
