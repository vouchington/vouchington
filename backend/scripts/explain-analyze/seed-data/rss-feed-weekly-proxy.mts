import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const RSS_FEED_WEEKLY_PROXY_VIEWER_ID = seedUuid(19_999, '01')
export const RSS_FEED_WEEKLY_PROXY_COMMUNITY_ID = seedUuid(600_001, '14')
export const RSS_FEED_WEEKLY_PROXY_RARE_MATCH_COUNT = 2
const RSS_FEED_WEEKLY_PROXY_LISTED_FEED_COUNT = 50
const RSS_FEED_WEEKLY_PROXY_LISTED_TOPIC_COUNT = 10_000
const RSS_FEED_WEEKLY_PROXY_NOISE_COMMUNITY_COUNT = 200
const RSS_FEED_WEEKLY_PROXY_NOISE_USER_COUNT = 200

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
  const noiseCommunityIds = Array.from(
    { length: RSS_FEED_WEEKLY_PROXY_NOISE_COMMUNITY_COUNT },
    (_, index) => seedUuid(600_002 + index, '14'),
  )
  await transaction(
    `/* seedRssFeedWeeklyProxy.noiseCommunities */
      INSERT INTO communities (id, name, slug, created_by_id, created_via, visibility)
      SELECT id, 'RSS Proxy Noise ' || ordinal::text,
        'rss-proxy-noise-' || ordinal::text, $2, 'system', 'public'
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
