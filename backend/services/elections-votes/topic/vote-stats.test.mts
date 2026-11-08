import { describe, expect, it } from 'vitest'
import { beginTransaction, createTestTopic, insertTestRssFeedDirect } from '@voucha/test-helpers'
import { backgroundQueue } from '@voucha/test-helpers/shared-background-queue'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
import { updateTopicElectionVoteStats } from './vote-stats.mts'
import { updateElectionStatsIfChanged } from '../shared/vote-stats-update.mts'
import { TOPIC_ELECTION_CONFIG } from './config.mts'

describe('topic vote stats side effects', () => {
  it('enqueues bounded discoverability work even when stats are unchanged', async () => {
    const topic = await createTestTopic({
      hostname: `vote-stats-${crypto.randomUUID()}.example.com`,
    })
    const feed = await insertTestRssFeedDirect({ topicId: topic.id })
    const admitted = Promise.withResolvers<PostPublicationEffectsJobData>()
    const onAdded = (job: { data: unknown }) => {
      const data = job.data as PostPublicationEffectsJobData
      if (data.scope?.id === topic.id && data.continuation?.kind === 'topic_feed_discoverability')
        admitted.resolve(data)
    }
    backgroundQueue.on('added', onAdded)
    try {
      await updateTopicElectionVoteStats(topic.id)
      const job = await admitted.promise
      expect(job.continuation).toEqual({
        kind: 'topic_feed_discoverability',
        subjectIds: [topic.id],
        subjectIndex: 0,
        after: null,
      })
      expect(feed.id).toBeDefined()
    } finally {
      backgroundQueue.off('added', onAdded)
    }
  })

  it('updates in a caller transaction without acquiring feed scope locks', async () => {
    const topic = await createTestTopic({
      hostname: `vote-stage-${crypto.randomUUID()}.example.com`,
    })
    const feed = await insertTestRssFeedDirect({ topicId: topic.id })
    await using holder = await beginTransaction()
    await holder(
      `/* holdUnrelatedFeedScope */ SELECT pg_advisory_xact_lock(hashtextextended('rss_feed:' || $1::uuid::text, 0))`,
      [feed.id],
    )
    await using transaction = await beginTransaction()
    await expect(
      updateElectionStatsIfChanged(
        TOPIC_ELECTION_CONFIG,
        topic.id,
        statsForNetScore(1),
        transaction,
      ),
    ).resolves.toBeDefined()
    await transaction.commit()
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
