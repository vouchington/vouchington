import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createVoteStatsUpdater } from '../shared/entity-service.mts'
import { TOPIC_ELECTION_CONFIG } from './config.mts'
import { invalidate } from '@services/entity-cache'
import { enqueueBulkUpdateTopicRatingStatsForTopicId } from '@queues/topic-ratings/enqueues'
import { enqueueBulkEvaluateRssFeedDiscoverability } from '@queues/rss-feed-discoverability/enqueues'
import { findRssFeedIdsByTopicIds } from '@services/entity-relations/rss-feed-ids-by-topic-ids'

export const updateTopicElectionVoteStats = createVoteStatsUpdater(TOPIC_ELECTION_CONFIG, {
  invalidate: invalidate.topic_elections,
  afterUpdate: async topicId => {
    const topicExists = await isTopicActive(topicId)
    if (topicExists) {
      await enqueueBulkUpdateTopicRatingStatsForTopicId([topicId])
      const rssFeedIds = await findRssFeedIdsByTopicIds([topicId])
      void enqueueBulkEvaluateRssFeedDiscoverability(rssFeedIds)
    }
  },
})

async function isTopicActive(topicId: string): Promise<boolean> {
  const { rows } = await read(sql`/* isTopicActive */
    SELECT 1
    FROM topics
    WHERE id = ${topicId}
      AND deleted_at IS NULL
      AND merged_into_topic_id IS NULL
    LIMIT 1
  `)
  return rows.length > 0
}
