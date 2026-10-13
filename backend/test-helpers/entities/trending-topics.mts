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
import { encodeCursor } from '@modules/pagination'
import { registerTestTrendingTopicWindowFixture } from '../trending-topics-window.mts'

type CreateTrendingTopicDataOptions = {
  postTagCount: number
  rssItemTagCount: number
  netVote: number
  createdAt?: Date
}

/** Scope a descending score page immediately before one owned fixture, despite a dirty ranking. */
export function createTrendingTopicCursorBefore(topicId: string, score: number): string {
  const hex = (BigInt(`0x${topicId.replaceAll('-', '')}`) + 1n).toString(16).padStart(32, '0')
  const id = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
  return encodeCursor({ id, score })
}

export async function createTrendingTopicData(options: CreateTrendingTopicDataOptions) {
  const user = await createTestUser()
  if (!user) throw new Error('Failed to create test user')
  const topicId = await insertTrendingTopicPosts(options, user.id)
  const feedId = await insertTrendingTopicRss(options, topicId, user.id)
  return { topicId, userId: user.id, feedId }
}

/** Create bounded fixture batches, settling all started writes before reporting failures. */
export async function createTrendingTopicsDataBatch(
  options: readonly CreateTrendingTopicDataOptions[],
  userId?: string,
) {
  const data: { topicId: string; userId: string }[] = []
  if (options.length === 0) return data
  const ownerId = userId ?? (await createTestUser()).id
  for (let offset = 0; offset < options.length; offset += 8) {
    const outcomes = await Promise.allSettled(
      options.slice(offset, offset + 8).map(async option => {
        const topicId = await insertTrendingTopicPosts(option, ownerId)
        if (option.rssItemTagCount > 0) {
          await insertTrendingTopicRss(option, topicId, ownerId)
        }
        return { topicId, userId: ownerId }
      }),
    )
    const errors: unknown[] = []
    for (const outcome of outcomes) {
      if (outcome.status === 'fulfilled') data.push(outcome.value)
      else errors.push(outcome.reason)
    }
    if (errors.length === 1) throw errors[0]
    if (errors.length > 1) throw new AggregateError(errors, 'Trending topic fixture writes failed')
  }
  return data
}

async function insertTrendingTopicPosts(options: CreateTrendingTopicDataOptions, userId: string) {
  const { postTagCount, netVote, createdAt } = options
  const random = createRandomString(10)
  // Always generate the topic ID in Node.js so UUIDv7 ordering is guaranteed:
  // topic at T-2ms, posts at T-1ms, relations at T.
  // This avoids DB/Node clock skew that could violate CHECK (id > object_id).
  const baseMs = createdAt ? createdAt.getTime() : Date.now()
  const topicId = await insertTopicWithTimestamp(userId, random, baseMs - 2)
  registerTestTrendingTopicWindowFixture(topicId, userId, baseMs)

  const postTopicMetadata = entityRelationMetadatum.find(
    m => m.subject_type === 'post' && m.object_type === 'topic' && m.predicate === 'category',
  )
  if (!postTopicMetadata) throw new Error('Missing post->topic relation metadata')

  // Batch-insert posts and relations
  if (postTagCount > 0) {
    await insertBatchPostRelations({
      count: postTagCount,
      topicId,
      userId,
      netVote,
      createdAt,
      tableName: postTopicMetadata.table_name,
    })
  }

  return topicId
}

async function insertTrendingTopicRss(
  options: CreateTrendingTopicDataOptions,
  topicId: string,
  userId: string,
) {
  const { rssItemTagCount, netVote, createdAt } = options
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
      userId,
      netVote,
      createdAt,
      tableName: rssFeedItemTopicMetadata.table_name,
    })
  }

  return feedId
}
