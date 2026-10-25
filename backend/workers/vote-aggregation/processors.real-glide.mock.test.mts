import { pagedDispatchConfig } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import { randomUUID } from 'node:crypto'
import { Queue, type Job, type JobOptions } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
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
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { caches } from '@services/entity-cache/caches'
import { getPostElectionById } from '@services/elections-votes/post/get-election'
import { adminSetVoteWeight } from '@services/vote-weight/admin-set'
import { gatherVoteWeightFactors } from '@services/vote-weight/gather-factors'
import { getVoteIntegrityFlags } from '@services/vote-integrity/get-flags'
import { VELOCITY_SPIKE_THRESHOLD } from '@services/vote-integrity/config'
import { MASS_REPORT_THRESHOLD } from '@services/report-integrity/config'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import {
  VOTE_AGGREGATION_BACKFILL_REPORT_INTEGRITY_JOB,
  VOTE_AGGREGATION_RECALCULATE_USER_VOTE_WEIGHT_JOB,
  VOTE_AGGREGATION_REFRESH_POST_METRICS_JOB,
  VOTE_AGGREGATION_REFRESH_TOPIC_METRICS_JOB,
  VOTE_AGGREGATION_REFRESH_USER_METRICS_JOB,
  VOTE_AGGREGATION_REPORT_INTEGRITY_JOB,
  VOTE_AGGREGATION_TOPIC_RATING_STATS_JOB,
  VOTE_AGGREGATION_UPDATE_ELECTION_JOB,
  VOTE_AGGREGATION_USER_ELECTION_FAN_OUT_JOB,
  VOTE_AGGREGATION_VOTE_INTEGRITY_JOB,
  VOTE_AGGREGATION_VOTE_WEIGHT_DISPATCHER_JOB,
} from '@queues/background/enqueues/vote-aggregation-jobs'
import { background } from '@queues/background/queues'
// A relative import: @workers/background depends on this package, so a package dependency would cycle.
import { BACKGROUND_HANDLERS } from '../background/processors/handlers.mts'
import { createBackgroundWorker } from '../background/workers/create-worker.mts'

// This project passes through the external transport and runs the production shared worker.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

type RoutedJob = { name: string; data: Record<string, unknown>; opts: JobOptions }

const job = (
  definition: { name: string; options: Readonly<JobOptions> },
  data: Record<string, unknown>,
  opts: JobOptions = {},
): RoutedJob => ({ name: definition.name, data, opts: { ...definition.options, ...opts } })

/** Runs jobs through the production `background` worker, serving only `vote-aggregation`, on an isolated prefix. */
async function runJobs(jobs: RoutedJob[]): Promise<Set<string>> {
  const prefix = `${workerQueuePrefix}-vote-aggregation-${randomUUID()}`
  const queue = new Queue(BACKGROUND_QUEUE_NAME, { connection: workerQueueConnection, prefix })
  let worker: ReturnType<typeof createBackgroundWorker> | undefined
  const completed = Promise.withResolvers<void>()
  const seen = new Set<string>()
  try {
    await queue.addBulk(jobs)
    worker = createBackgroundWorker({
      handlers: BACKGROUND_HANDLERS,
      domains: ['vote-aggregation'],
      prefix,
      concurrency: 1,
    })
    worker.on('error', error => completed.reject(error))
    worker.on('failed', (_job, error) => completed.reject(error))
    worker.on('completed', (done: Job) => {
      seen.add(done.name)
      if (seen.size === new Set(jobs.map(entry => entry.name)).size) completed.resolve()
    })
    await completed.promise
    return seen
  } finally {
    if (worker) await closeAndUnregisterGlideMQInstance(worker)
    await queue.obliterate({ force: true })
    await queue.close()
  }
}

async function removeJobs(name: string, data: Record<string, unknown>): Promise<Job[]> {
  const found = await background.searchJobs({ name, data })
  await Promise.all(found.map(entry => entry.remove()))
  return found
}

describe('vote-aggregation domain through the production background worker', () => {
  it('routes election, rating, and all metric jobs to durable or cached effects', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({
      hostname: `vote-aggregation-${randomUUID()}.example.com`,
    })
    const post = await createTestPost({ user })
    await insertTestReview({ userId: user.id, topicRatings: [{ topicId: topic.id, rating: 4 }] })
    await insertPostElectionVote(user.id, post.id, 1, undefined, false, true)

    const jobs = [
      job(VOTE_AGGREGATION_UPDATE_ELECTION_JOB, { electionId: post.id, orderingKey: 'post' }),
      job(VOTE_AGGREGATION_TOPIC_RATING_STATS_JOB, { topicId: topic.id }),
      job(VOTE_AGGREGATION_REFRESH_TOPIC_METRICS_JOB, { id: topic.id }),
      job(VOTE_AGGREGATION_REFRESH_POST_METRICS_JOB, { id: post.id }),
      job(VOTE_AGGREGATION_REFRESH_USER_METRICS_JOB, { id: user.id }),
    ]
    const seen = await runJobs(jobs)
    expect(seen).toEqual(new Set(jobs.map(entry => entry.name)))
    await expect(getPostElectionById(post.id)).resolves.toMatchObject({ votes_count_up: 1 })
    await expect(getTopicRatingStats(topic.id)).resolves.toMatchObject({ ratings__count__4: 1 })
    await expect(caches.topic_metrics.get(topic.id)).resolves.toMatchObject({ id: topic.id })
    await expect(caches.post_metrics.get(post.id)).resolves.toMatchObject({ id: post.id })
    await expect(caches.user_metrics.get(user.id)).resolves.toMatchObject({ id: user.id })
  })

  it('rejects an election in a lane the worker does not know', async () => {
    await expect(
      runJobs([
        job(
          VOTE_AGGREGATION_UPDATE_ELECTION_JOB,
          { electionId: randomUUID(), orderingKey: 'not_a_lane' },
          { attempts: 1 },
        ),
      ]),
    ).rejects.toThrow('Unknown ordering key: not_a_lane')
  })

  it('recalculates a user vote weight and dispatches a later eligible user', async () => {
    const privileged = await createTestUser({ administrator: true })
    await adminSetVoteWeight(privileged.id, privileged.id, 1)
    await runJobs([
      job(VOTE_AGGREGATION_RECALCULATE_USER_VOTE_WEIGHT_JOB, {
        userId: privileged.id,
        forceRecalculate: true,
      }),
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
    await runJobs([job(VOTE_AGGREGATION_VOTE_WEIGHT_DISPATCHER_JOB, { afterId: cursor.id })])
    const children = await removeJobs(VOTE_AGGREGATION_RECALCULATE_USER_VOTE_WEIGHT_JOB.name, {
      userId: target.id,
    })
    expect(children).toHaveLength(1)
  })

  it('fans a user out one bounded page at a time, continuing through its cursor', async () => {
    const voter = await createTestUser()
    const posts = await Promise.all([1, 2].map(() => createTestPost({ user: voter })))
    for (const post of posts) await insertPostElectionVote(voter.id, post.id, 1)
    const restore = overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
      elections_page_size: 1,
    })
    try {
      await runJobs([
        job(VOTE_AGGREGATION_USER_ELECTION_FAN_OUT_JOB, { userId: voter.id, cursor: null }),
      ])
    } finally {
      restore()
    }

    // The first page covered one vote and queued the continuation from that page's last row.
    const continuations = await removeJobs(VOTE_AGGREGATION_USER_ELECTION_FAN_OUT_JOB.name, {
      userId: voter.id,
    })
    expect(continuations).toHaveLength(1)
    const { cursor } = continuations[0]!.data as { cursor: { lane: number; afterId: string } }
    expect(cursor.lane).toBe(1)
    expect(posts.map(post => post.id)).toContain(cursor.afterId)
    const queued = await Promise.all(
      posts.map(post =>
        removeJobs(VOTE_AGGREGATION_UPDATE_ELECTION_JOB.name, { electionId: post.id }),
      ),
    )
    expect(queued.flat()).toHaveLength(1)
    expect((queued.flat()[0]!.data as { electionId: string }).electionId).toBe(cursor.afterId)
  })

  it('persists a vote-integrity flag from a suspicious burst', async () => {
    const author = await createTestUser()
    const post = await createTestPost({ user: author })
    const voters = await Promise.all(
      Array.from({ length: VELOCITY_SPIKE_THRESHOLD + 1 }, () => createTestUser()),
    )
    await Promise.all(voters.map(voter => insertTestPostVote(post.id, voter.id, '5.6.7.8', 1)))
    await runJobs([
      job(VOTE_AGGREGATION_VOTE_INTEGRITY_JOB, {
        entityType: 'post',
        entityId: post.id,
        userId: author.id,
        ipAddress: '5.6.7.8',
        score: 1,
      }),
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
      job(VOTE_AGGREGATION_REPORT_INTEGRITY_JOB, { entityType: 'user', entityId: target.id }),
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
    // The shared test database holds other pending reports, so start the page at the second target.
    await runJobs([
      job(VOTE_AGGREGATION_BACKFILL_REPORT_INTEGRITY_JOB, { afterId: uuidBefore(secondTarget.id) }),
    ])
    const children = await removeJobs(VOTE_AGGREGATION_REPORT_INTEGRITY_JOB.name, {
      entityId: secondTarget.id,
    })
    expect(children).toHaveLength(1)
  })
})
