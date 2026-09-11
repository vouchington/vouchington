import { describe, expect, it, vi } from 'vitest'
import {
  beginTransaction,
  createTestTopic,
  getTestPostPublicationDirtyWorkForScope,
  insertTestRssFeedDirect,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { lockPostPublicationRssFeedScopes } from '@services/post-publication'
import { rssFeedDiscoverability } from '@queues/rss-feed-discoverability/queues'
import { updateTopicElectionVoteStats } from './vote-stats.mts'
import { updateElectionStatsIfChanged } from '../shared/vote-stats-update.mts'
import { TOPIC_ELECTION_CONFIG } from './config.mts'

describe('topic vote stats side effects', () => {
  it('captures attached feed work transactionally across discoverability threshold transitions', async () => {
    const topic = await createTestTopic({
      hostname: `topic-vote-capture-${Date.now()}.example.com`,
    })
    const rssFeed = await insertTestRssFeedDirect({ topicId: topic.id })
    const discoverableThreshold = 5
    const baseline = discoverableThreshold - 1

    await updateElectionStatsIfChanged(TOPIC_ELECTION_CONFIG, topic.id, statsForNetScore(baseline))
    const baselineWork = await getTestPostPublicationDirtyWorkForScope({
      type: 'rss_feed',
      id: rssFeed.id,
    })
    expect(baselineWork?.reasons).toContain('rss_feed_discoverability_changed')

    async function rejectTopicDiscoverabilityThresholdCapture(): Promise<void> {
      await using query = await beginTransaction()
      await updateElectionStatsIfChanged(
        TOPIC_ELECTION_CONFIG,
        topic.id,
        statsForNetScore(discoverableThreshold),
        query,
      )
      throw new Error('rollback topic discoverability threshold capture')
    }
    await expect(rejectTopicDiscoverabilityThresholdCapture()).rejects.toThrow(
      'rollback topic discoverability threshold capture',
    )
    const rolledBackWork = await getTestPostPublicationDirtyWorkForScope({
      type: 'rss_feed',
      id: rssFeed.id,
    })
    expect(rolledBackWork?.generation).toBe(baselineWork?.generation)

    await updateElectionStatsIfChanged(
      TOPIC_ELECTION_CONFIG,
      topic.id,
      statsForNetScore(discoverableThreshold),
    )
    const entered = await getTestPostPublicationDirtyWorkForScope({
      type: 'rss_feed',
      id: rssFeed.id,
    })
    expect(Number(entered?.generation)).toBeGreaterThan(Number(baselineWork?.generation))

    await updateElectionStatsIfChanged(TOPIC_ELECTION_CONFIG, topic.id, statsForNetScore(baseline))
    const recovered = await getTestPostPublicationDirtyWorkForScope({
      type: 'rss_feed',
      id: rssFeed.id,
    })
    expect(Number(recovered?.generation)).toBeGreaterThan(Number(entered?.generation))
  })

  it('enqueues RSS feed discoverability evaluation for feeds attached to the topic', async () => {
    const topic = await createTestTopic({ hostname: `vote-stats-${Date.now()}.example.com` })
    const rssFeed = await insertTestRssFeedDirect({ topicId: topic.id })

    await updateTopicElectionVoteStats(topic.id)

    const waiting = await readAllQueueJobs(rssFeedDiscoverability)
    expect(
      waiting.some(
        job =>
          job.name === 'processEvaluateRssFeedDiscoverability' &&
          (job.data as { rssFeedId?: string }).rssFeedId === rssFeed.id,
      ),
    ).toBe(true)
  })

  it('locks attached feed publication scopes before waiting on the topic row', async () => {
    expect.hasAssertions()
    const topic = await createTestTopic({
      hostname: `topic-vote-lock-${crypto.randomUUID()}.example.com`,
    })
    const rssFeed = await insertTestRssFeedDirect({ topicId: topic.id })
    const topicLocked = Promise.withResolvers<void>()
    const releaseTopic = Promise.withResolvers<void>()
    const holder = holdTopicRowLock()

    async function holdTopicRowLock(): Promise<void> {
      await using query = await beginTransaction()
      await query(
        `/* topic vote stats lock holder */ SELECT id FROM topics WHERE id = $1::uuid FOR UPDATE`,
        [topic.id],
      )
      topicLocked.resolve()
      await releaseTopic.promise

      await query.commit()
    }
    await topicLocked.promise
    const updating = updateElectionStatsIfChanged(
      TOPIC_ELECTION_CONFIG,
      topic.id,
      statsForNetScore(1),
    )
    try {
      await vi.waitFor(async () => {
        await expect(lockRssFeedPublicationScope()).rejects.toMatchObject({ code: '55P03' })
      })
    } finally {
      releaseTopic.resolve()
    }
    await holder
    await expect(updating).resolves.toBeDefined()

    async function lockRssFeedPublicationScope(): Promise<void> {
      await using query = await beginTransaction()
      await query(`/* topic vote stats feed scope timeout */ SET LOCAL lock_timeout = '50ms'`)
      await lockPostPublicationRssFeedScopes(query, [rssFeed.id])
      await query.commit()
    }
  })
})

function statsForNetScore(score: number) {
  return {
    votes_score_up: Math.max(score, 0),
    votes_score_none: 0,
    votes_score_down: Math.max(-score, 0),
    votes_count_up: score > 0 ? 1 : 0,
    votes_count_none: 0,
    votes_count_down: score < 0 ? 1 : 0,
    snapshot: { xmax: '0', xipCount: 0 },
  }
}
