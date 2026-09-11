/**
 * Test helper for creating trending topics data.
 *
 * Uses direct SQL inserts (no entity listeners) and batch operations
 * to avoid test timeouts under parallel load.
 */

import { createTestUser } from './users.mts'
import { insertTestRssFeed } from './rss-feeds.mts'
import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import { createRandomString } from '../data.mts'
import { insertBatchPostRelations } from './trending-topics/post-relations.mts'
import { insertBatchRssRelations } from './trending-topics/rss-relations.mts'
import { insertTopicWithTimestamp } from './trending-topics/topic.mts'

type CreateTrendingTopicDataOptions = {
  postTagCount: number
  rssItemTagCount: number
  netVote: number
  createdAt?: Date
}

export async function createTrendingTopicData(options: CreateTrendingTopicDataOptions) {
  const { postTagCount, rssItemTagCount, netVote, createdAt } = options

  const user = await createTestUser()
  if (!user) throw new Error('Failed to create test user')

  const random = createRandomString(10)
  // Always generate the topic ID in Node.js so UUIDv7 ordering is guaranteed:
  // topic at T-2ms, posts at T-1ms, relations at T.
  // This avoids DB/Node clock skew that could violate CHECK (id > object_id).
  const baseMs = createdAt ? createdAt.getTime() : Date.now()
  const topicId = await insertTopicWithTimestamp(user.id, random, baseMs - 2)

  const postTopicMetadata = entityRelationMetadatum.find(
    m => m.subject_type === 'post' && m.object_type === 'topic' && m.predicate === 'category',
  )
  if (!postTopicMetadata) throw new Error('Missing post->topic relation metadata')

  // Batch-insert posts and relations
  if (postTagCount > 0) {
    await insertBatchPostRelations({
      count: postTagCount,
      topicId,
      userId: user.id,
      netVote,
      createdAt,
      tableName: postTopicMetadata.table_name,
    })
  }

  // Create RSS feed items and relations
  const rssFeedItemTopicMetadata = entityRelationMetadatum.find(
    m =>
      m.subject_type === 'rss_feed_item' && m.object_type === 'topic' && m.predicate === 'category',
  )
  if (!rssFeedItemTopicMetadata) throw new Error('Missing rss_feed_item->topic relation metadata')

  const feedRandom = createRandomString(13)
  const feedId = await insertTestRssFeed({
    topicId,
    title: `Test Feed ${feedRandom}`,
  })

  if (rssItemTagCount > 0) {
    await insertBatchRssRelations({
      count: rssItemTagCount,
      topicId,
      feedId,
      userId: user.id,
      netVote,
      createdAt,
      tableName: rssFeedItemTopicMetadata.table_name,
    })
  }

  return {
    topicId,
    userId: user.id,
    feedId,
  }
}
