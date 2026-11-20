import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { contentHash, seedUuid } from './common.mts'

export const RSS_FEED_WEEKLY_PROXY_VIEWER_ID = seedUuid(19_999, '01')
export const RSS_FEED_WEEKLY_PROXY_COMMUNITY_ID = seedUuid(600_001, '14')
export const RSS_FEED_WEEKLY_PROXY_RARE_MATCH_COUNT = 2
const RSS_FEED_WEEKLY_PROXY_LISTED_FEED_COUNT = 50
export const RSS_FEED_WEEKLY_PROXY_LISTED_TOPIC_COUNT = 10_000
const RSS_FEED_WEEKLY_PROXY_TOPIC_ID_BASE = 800_000
const RSS_FEED_WEEKLY_PROXY_TOPIC_CANDIDATE_COUNT = 10_000
const RSS_FEED_WEEKLY_PROXY_NOISE_COMMUNITY_COUNT = 200
const RSS_FEED_WEEKLY_PROXY_NOISE_USER_COUNT = 200
export const RSS_FEED_WEEKLY_PROXY_NOISE_FOLLOW_COUNT =
  RSS_FEED_WEEKLY_PROXY_NOISE_COMMUNITY_COUNT * RSS_FEED_WEEKLY_PROXY_NOISE_USER_COUNT

/** Gives a viewer without direct feed/topic follows one large, realistic proxy list. */
export async function seedRssFeedWeeklyProxy(): Promise<void> {
  await using transaction = await beginTransaction()
  const ownerId = seedUuid(0, '01')
  await transaction(
    `/* seedRssFeedWeeklyProxy.community */
      INSERT INTO communities (id, name, slug, created_by_id, created_via, visibility)
      VALUES ($1, 'RSS Weekly Proxy List', 'rss-weekly-proxy-list', $2, 'system', 'public')
      ON CONFLICT (id) DO NOTHING`,
    [RSS_FEED_WEEKLY_PROXY_COMMUNITY_ID, ownerId],
  )
  await transaction(
    `/* seedRssFeedWeeklyProxy.follow */
      INSERT INTO relation__user__proxy_follow__community (subject_id, object_id)
      VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [RSS_FEED_WEEKLY_PROXY_VIEWER_ID, RSS_FEED_WEEKLY_PROXY_COMMUNITY_ID],
  )
  await transaction(
    `/* seedRssFeedWeeklyProxy.feeds */
      INSERT INTO community_list_rss_feeds (community_id, rss_feed_id, added_by_id)
      SELECT $1, feed_id, $3
      FROM unnest($2::uuid[]) AS list(feed_id)
      ON CONFLICT DO NOTHING`,
    [
      RSS_FEED_WEEKLY_PROXY_COMMUNITY_ID,
      Array.from({ length: RSS_FEED_WEEKLY_PROXY_LISTED_FEED_COUNT }, (_, index) =>
        seedUuid(index, '08'),
      ),
      ownerId,
    ],
  )
  await ensureProxyTopicCorpus(transaction)
  await transaction(
    `/* seedRssFeedWeeklyProxy.topics */
      INSERT INTO community_list_topics (community_id, topic_id, added_by_id)
      SELECT $1, topic.id, $2
      FROM (
        SELECT id FROM topics
        WHERE deleted_at IS NULL AND merged_into_topic_id IS NULL
        ORDER BY id LIMIT $3
      ) topic
      ON CONFLICT DO NOTHING`,
    [RSS_FEED_WEEKLY_PROXY_COMMUNITY_ID, ownerId, RSS_FEED_WEEKLY_PROXY_LISTED_TOPIC_COUNT],
  )
  const { rows: topicRows } = await transaction<{ count: number }>(
    `/* seedRssFeedWeeklyProxy.topicCount */
      SELECT count(*)::int AS count FROM community_list_topics
      WHERE community_id = $1 AND removed_at IS NULL`,
    [RSS_FEED_WEEKLY_PROXY_COMMUNITY_ID],
  )
  if (topicRows[0]?.count !== RSS_FEED_WEEKLY_PROXY_LISTED_TOPIC_COUNT)
    throw new Error(
      `RSS proxy topic list must contain exactly ${RSS_FEED_WEEKLY_PROXY_LISTED_TOPIC_COUNT} active topics; found ${topicRows[0]?.count ?? 0}`,
    )
  const noiseCommunityIds = Array.from(
    { length: RSS_FEED_WEEKLY_PROXY_NOISE_COMMUNITY_COUNT },
    (_, index) => seedUuid(600_002 + index, '14'),
  )
  // Their followers rank them first in the subscription walk. The "explain" name keeps them
  // matches for community search's text scenarios, so they fill the page instead of preceding it.
  await transaction(
    `/* seedRssFeedWeeklyProxy.noiseCommunities */
      INSERT INTO communities (id, name, slug, created_by_id, created_via, visibility)
      SELECT id, 'Explain RSS Proxy Noise ' || ordinal::text,
        'explain-rss-proxy-noise-' || ordinal::text, $2, 'system', 'public'
      FROM unnest($1::uuid[]) WITH ORDINALITY AS noise(id, ordinal)
      ON CONFLICT (id) DO NOTHING`,
    [noiseCommunityIds, ownerId],
  )
  await transaction(
    `/* seedRssFeedWeeklyProxy.noiseFeeds */
      INSERT INTO community_list_rss_feeds (community_id, rss_feed_id, added_by_id)
      SELECT community_id, feed_id, $3
      FROM unnest($1::uuid[]) AS communities(community_id)
      CROSS JOIN unnest($2::uuid[]) AS feeds(feed_id)
      ON CONFLICT DO NOTHING`,
    [
      noiseCommunityIds,
      Array.from({ length: RSS_FEED_WEEKLY_PROXY_LISTED_FEED_COUNT }, (_, index) =>
        seedUuid(index, '08'),
      ),
      ownerId,
    ],
  )
  await transaction(
    `/* seedRssFeedWeeklyProxy.noiseFollows */
      INSERT INTO relation__user__proxy_follow__community (subject_id, object_id)
      SELECT user_id, community_id
      FROM unnest($1::uuid[]) AS users(user_id)
      CROSS JOIN unnest($2::uuid[]) AS communities(community_id)
      ON CONFLICT DO NOTHING`,
    [
      Array.from({ length: RSS_FEED_WEEKLY_PROXY_NOISE_USER_COUNT }, (_, index) =>
        seedUuid(10_000 + index, '01'),
      ),
      noiseCommunityIds,
    ],
  )
  await transaction.commit()
}

async function ensureProxyTopicCorpus(query: TransactionQuery): Promise<void> {
  const { rows: countRows } = await query<{ count: number }>(
    `/* seedRssFeedWeeklyProxy.activeTopicCount */
      SELECT count(*)::int AS count FROM topics
      WHERE deleted_at IS NULL AND merged_into_topic_id IS NULL`,
  )
  const missingCount = Math.max(
    RSS_FEED_WEEKLY_PROXY_LISTED_TOPIC_COUNT - (countRows[0]?.count ?? 0),
    0,
  )
  if (missingCount === 0) return

  const candidateIds = Array.from({ length: RSS_FEED_WEEKLY_PROXY_TOPIC_CANDIDATE_COUNT }, (_, i) =>
    seedUuid(RSS_FEED_WEEKLY_PROXY_TOPIC_ID_BASE + i, '04'),
  )
  const { rows: existingRows } = await query<{ id: string }>(
    `/* seedRssFeedWeeklyProxy.existingTopicCandidates */
      SELECT id FROM topics WHERE id = ANY($1::uuid[])`,
    [candidateIds],
  )
  const existingIds = new Set(existingRows.map(row => row.id))
  const topicIds = candidateIds.filter(id => !existingIds.has(id)).slice(0, missingCount)
  const topicIndexes = new Map(
    candidateIds.map((id, index) => [id, RSS_FEED_WEEKLY_PROXY_TOPIC_ID_BASE + index]),
  )
  if (topicIds.length !== missingCount)
    throw new Error('RSS proxy topic seed has too few unused deterministic topic ids')

  const indexes = topicIds.map(id => topicIndexes.get(id)!)
  const slugs = indexes.map(index => `rss-weekly-proxy-topic-${index}`)
  await query(
    `/* seedRssFeedWeeklyProxy.missingTopics */
      INSERT INTO topics
        (id, name, slug, gemini_embedding_2_content_sha256, created_via)
      SELECT id, name, slug, decode(hash, 'hex'), 'system'
      FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[])
        AS seed(id, name, slug, hash)
      ON CONFLICT (id) DO NOTHING`,
    [
      topicIds,
      indexes.map(index => `RSS weekly proxy topic ${index}`),
      slugs,
      slugs.map(slug => contentHash(slug).toString('hex')),
    ],
  )
}
