/**
 * High-level test entity creation helpers
 */

import type { PrivateUser } from '@voucha/types/entities/user'
import { insertTestRssFeed, updateRssFeedTiming } from './rss-feeds.mts'
import { insertTestRssFeedItem } from './rss-feed-items.mts'
import { insertTestUrlDirect } from './urls.mts'
import { createHash } from 'node:crypto'
import { insertEntityRelation } from './entity-relations.mts'
import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import { insertScoredPostTopicCategoryRelation } from './entity-relations-posts.mts'

/**
 * Create an eligible post-to-topic category fixture without service or worker side effects.
 */
export async function relatePostToTopic(
  user: PrivateUser,
  post: { id: string },
  topic: { id: string },
) {
  const relation = await insertScoredPostTopicCategoryRelation(post.id, topic.id, user.id)
  return [relation]
}

/**
 * Create a test RSS feed with timing set
 */
export async function createTestRssFeedWithTiming(topicId: string) {
  const random = Math.random().toString(36).slice(2, 15)
  const feedId = await insertTestRssFeed({
    topicId,
    title: `Test Feed ${random}`,
  })
  await updateRssFeedTiming(feedId, new Date())
  return feedId
}

/**
 * Create a test RSS feed item with a URL.
 *
 * `published_at` is a generated column: LEAST(isoDate, pubDate, uuid_extract_timestamp(id)),
 * defaulting to the item's insertion instant when isoDate/pubDate are absent (as they are
 * here). Pass `createdAt` to pin that instant explicitly — e.g. a bounded near-future offset
 * makes the item sort ahead of whatever other integration-test files concurrently insert into
 * the shared, parallel-running database in recency-ordered ("published_at DESC") queries,
 * while still decaying into ordinary history shortly after so the fixture doesn't permanently
 * dominate those queries. Avoid unbounded far-future dates for this reason.
 */
export async function createTestRssFeedItemWithUrl(
  rssFeedId: string,
  options?: { createdAt?: Date },
) {
  const random = Math.random().toString(36).slice(2, 15)
  const guid = `guid-${random}`
  const title = `Test Item ${random}`
  const urlObj = await insertTestUrlDirect(null, `https://example.com/${random}`, {
    content_type: 'text/html',
  })
  const contentSha256 = createHash('sha256').update(random).digest()
  const itemId = await insertTestRssFeedItem({
    rssFeedId,
    urlId: urlObj!.id,
    guid,
    itemData: { title },
    contentSha256,
    createdAt: options?.createdAt,
  })
  return { id: itemId, guid, title }
}

/**
 * Follow a user
 */
export async function followUser(follower: PrivateUser, followee: PrivateUser) {
  const metadata = entityRelationMetadatum.find(
    m => m.subject_type === 'user' && m.object_type === 'user' && m.predicate === 'follow',
  )!
  await insertEntityRelation(metadata.table_name, follower.id, followee.id)
}

/**
 * Follow a topic
 */
export async function followTopic(user: PrivateUser, topic: { id: string }) {
  const metadata = entityRelationMetadatum.find(
    m => m.subject_type === 'user' && m.object_type === 'topic' && m.predicate === 'follow',
  )!
  await insertEntityRelation(metadata.table_name, user.id, topic.id)
}

/**
 * Follow an RSS feed
 */
export async function followRssFeed(user: PrivateUser, rssFeedId: string) {
  const metadata = entityRelationMetadatum.find(
    m => m.subject_type === 'user' && m.object_type === 'rss_feed' && m.predicate === 'follow',
  )!
  await insertEntityRelation(metadata.table_name, user.id, rssFeedId)
}

/**
 * Mute a user
 */
export async function muteUser(user: PrivateUser, mutedUser: PrivateUser) {
  const metadata = entityRelationMetadatum.find(
    m => m.subject_type === 'user' && m.object_type === 'user' && m.predicate === 'mute',
  )!
  await insertEntityRelation(metadata.table_name, user.id, mutedUser.id)
}

/**
 * Mute a topic
 */
export async function muteTopic(user: PrivateUser, topic: { id: string }) {
  const metadata = entityRelationMetadatum.find(
    m => m.subject_type === 'user' && m.object_type === 'topic' && m.predicate === 'mute',
  )!
  await insertEntityRelation(metadata.table_name, user.id, topic.id)
}

/**
 * Block a user
 */
export async function blockUser(user: PrivateUser, blockedUser: PrivateUser) {
  const metadata = entityRelationMetadatum.find(
    m => m.subject_type === 'user' && m.object_type === 'user' && m.predicate === 'block',
  )!
  await insertEntityRelation(metadata.table_name, user.id, blockedUser.id)
}

/**
 * Hide a post
 */
export async function hidePost(user: PrivateUser, post: { id: string }) {
  const metadata = entityRelationMetadatum.find(
    m => m.subject_type === 'user' && m.object_type === 'post' && m.predicate === 'hide',
  )!
  await insertEntityRelation(metadata.table_name, user.id, post.id)
}

/**
 * Mute an RSS feed
 */
export async function muteRssFeed(user: PrivateUser, rssFeedId: string) {
  const metadata = entityRelationMetadatum.find(
    m => m.subject_type === 'user' && m.object_type === 'rss_feed' && m.predicate === 'mute',
  )!
  await insertEntityRelation(metadata.table_name, user.id, rssFeedId)
}

/**
 * Block a URL hostname from appearing in a user's feed
 */
export async function blockUrlHostname(user: PrivateUser, hostnameId: string) {
  const metadata = entityRelationMetadatum.find(
    m => m.subject_type === 'user' && m.object_type === 'url_hostname' && m.predicate === 'block',
  )!
  await insertEntityRelation(metadata.table_name, user.id, hostnameId)
}

/**
 * Mute a URL hostname from appearing in a user's feed
 */
export async function muteUrlHostname(user: PrivateUser, hostnameId: string) {
  const metadata = entityRelationMetadatum.find(
    m => m.subject_type === 'user' && m.object_type === 'url_hostname' && m.predicate === 'mute',
  )!
  await insertEntityRelation(metadata.table_name, user.id, hostnameId)
}

/**
 * Hide an RSS feed item
 */
export async function hideRssFeedItem(user: PrivateUser, item: { id: string }) {
  const metadata = entityRelationMetadatum.find(
    m => m.subject_type === 'user' && m.object_type === 'rss_feed_item' && m.predicate === 'hide',
  )!

  await insertEntityRelation(metadata.table_name, user.id, item.id)
}
