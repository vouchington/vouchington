import { write } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const RECOMMENDED_RSS_FEEDS_POPULAR_FEED_INDEX = 2400
export const RECOMMENDED_RSS_FEEDS_CO_FOLLOWER_COUNT = 1000
export const RECOMMENDED_RSS_FEEDS_CO_FOLLOWER_FEEDS = 30
export const RECOMMENDED_RSS_FEEDS_VIEWER_EXTRA_FEEDS = 30

const FIRST_CO_FOLLOWER_INDEX = 5000
const FIRST_CANDIDATE_FEED_INDEX = 2000
const CANDIDATE_FEED_COUNT = 400

export const RECOMMENDED_RSS_FEEDS_HEAVY_VIEWER_INDEX = 15_000
const FIRST_HEAVY_FRIEND_INDEX = 15_001
const HEAVY_FRIEND_COUNT = 500
const HEAVY_FEEDS_PER_FRIEND = 40
const HEAVY_FRIEND_FEED_POOL = 1_500
const FIRST_HEAVY_TOPIC_INDEX = 1_500
const HEAVY_TOPIC_COUNT = 500
const HEAVY_VIEWER_FEED_START = 2_410
const HEAVY_VIEWER_FEED_COUNT = 5

/**
 * One popular feed followed by the viewer (seeduser0) and by a large cohort, each of whom also
 * follows many other feeds. The collaborative arm must read only the newest co-followers of the
 * viewer's newest follows instead of expanding every co-follower's whole follow list.
 */
export async function seedRecommendedRssFeedsPopularFeed(): Promise<void> {
  console.log('Seeding recommended RSS feeds popular-feed cohort...')
  const popularFeedId = seedUuid(RECOMMENDED_RSS_FEEDS_POPULAR_FEED_INDEX, '08')
  const subjects: string[] = []
  const objects: string[] = []
  const add = (subjectId: string, objectId: string) => {
    subjects.push(subjectId)
    objects.push(objectId)
  }
  const viewerId = seedUuid(0, '01')
  add(viewerId, popularFeedId)
  for (let i = 0; i < RECOMMENDED_RSS_FEEDS_VIEWER_EXTRA_FEEDS; i++)
    add(viewerId, seedUuid(FIRST_CANDIDATE_FEED_INDEX + i, '08'))
  for (let u = 0; u < RECOMMENDED_RSS_FEEDS_CO_FOLLOWER_COUNT; u++) {
    const coFollowerId = seedUuid(FIRST_CO_FOLLOWER_INDEX + u, '01')
    add(coFollowerId, popularFeedId)
    for (let j = 0; j < RECOMMENDED_RSS_FEEDS_CO_FOLLOWER_FEEDS; j++) {
      // 13 is coprime with the candidate pool, so each co-follower's feeds are distinct.
      const candidate = FIRST_CANDIDATE_FEED_INDEX + ((u + j * 13) % CANDIDATE_FEED_COUNT)
      add(coFollowerId, seedUuid(candidate, '08'))
    }
  }
  await write(
    `/* seedRecommendedRssFeedsPopularFeed */ INSERT INTO relation__user__follow__rss_feed (subject_id, object_id, created_by_id)
     SELECT subject_id, object_id, subject_id FROM UNNEST($1::uuid[], $2::uuid[]) AS s(subject_id, object_id)
     ON CONFLICT DO NOTHING`,
    [subjects, objects],
  )
}

export async function vacuumRecommendedRssFeedsFollows(): Promise<void> {
  await write(
    '/* vacuumRecommendedRssFeedsFollows */ VACUUM (ANALYZE) relation__user__follow__rss_feed',
  )
}

export async function pinRecommendedRssFeedsFollowsVisibility(allVisible: boolean): Promise<void> {
  await write(
    `/* pinRecommendedRssFeedsFollowsVisibility */
     SELECT pg_restore_relation_stats(
       'schemaname', 'public',
       'relname', 'relation__user__follow__rss_feed',
       'relpages', relpages,
       'reltuples', reltuples,
       'relallvisible', ${allVisible ? 'relpages' : '0'}
     )
     FROM pg_class
     WHERE oid = 'public.relation__user__follow__rss_feed'::regclass`,
  )
}

/** Removes the cohort so whole-table scenarios (MV refreshes) keep their seeded row counts. */
export async function cleanupRecommendedRssFeedsPopularFeed(): Promise<void> {
  const viewerId = seedUuid(0, '01')
  const firstCoFollower = seedUuid(FIRST_CO_FOLLOWER_INDEX, '01')
  const lastCoFollower = seedUuid(
    FIRST_CO_FOLLOWER_INDEX + RECOMMENDED_RSS_FEEDS_CO_FOLLOWER_COUNT - 1,
    '01',
  )
  const viewerFeeds = [
    seedUuid(RECOMMENDED_RSS_FEEDS_POPULAR_FEED_INDEX, '08'),
    ...Array.from({ length: RECOMMENDED_RSS_FEEDS_VIEWER_EXTRA_FEEDS }, (_, i) =>
      seedUuid(FIRST_CANDIDATE_FEED_INDEX + i, '08'),
    ),
  ]
  await write(
    `/* cleanupRecommendedRssFeedsPopularFeed */ DELETE FROM relation__user__follow__rss_feed
     WHERE (subject_id = $1 AND object_id = ANY($2::uuid[]))
        OR subject_id BETWEEN $3 AND $4`,
    [viewerId, viewerFeeds, firstCoFollower, lastCoFollower],
  )
  await write(
    '/* vacuumRecommendedRssFeedsCleanup */ VACUUM (ANALYZE) relation__user__follow__rss_feed',
  )
}

/**
 * Viewer who follows 500 users (each following 40 feeds = 20,000 follow rows) and 500 topics.
 * The friends and topic arms must read only the newest capped slices instead of expanding all rows.
 */
export async function seedRecommendedRssFeedsHeavyFriendsAndTopics(): Promise<void> {
  console.log('Seeding recommended RSS feeds heavy friends and topics cohort...')
  const viewerId = seedUuid(RECOMMENDED_RSS_FEEDS_HEAVY_VIEWER_INDEX, '01')
  const friendUsers: string[] = []
  const friendFeedSubjects: string[] = []
  const friendFeedObjects: string[] = []
  for (let u = 0; u < HEAVY_FRIEND_COUNT; u++) {
    const friendId = seedUuid(FIRST_HEAVY_FRIEND_INDEX + u, '01')
    friendUsers.push(friendId)
    for (let j = 0; j < HEAVY_FEEDS_PER_FRIEND; j++) {
      // 17 is coprime with 1500 so each friend follows 40 distinct discoverable feeds.
      const feedIndex = (u * 3 + j * 17) % HEAVY_FRIEND_FEED_POOL
      friendFeedSubjects.push(friendId)
      friendFeedObjects.push(seedUuid(feedIndex, '08'))
    }
  }
  const topicIds = Array.from({ length: HEAVY_TOPIC_COUNT }, (_, i) =>
    seedUuid(FIRST_HEAVY_TOPIC_INDEX + i, '04'),
  )
  const viewerFeeds = Array.from({ length: HEAVY_VIEWER_FEED_COUNT }, (_, i) =>
    seedUuid(HEAVY_VIEWER_FEED_START + i, '08'),
  )

  await write(
    `/* seedRecommendedRssFeedsHeavyFriends */ INSERT INTO relation__user__follow__user (subject_id, object_id, created_by_id, created_at)
     SELECT $1::uuid, friend_id, $1::uuid, CURRENT_TIMESTAMP - ((ordinality - 1) * INTERVAL '1 second')
     FROM UNNEST($2::uuid[]) WITH ORDINALITY AS s(friend_id, ordinality)
     ON CONFLICT DO NOTHING`,
    [viewerId, friendUsers],
  )
  await write(
    `/* seedRecommendedRssFeedsHeavyFriendFeeds */ INSERT INTO relation__user__follow__rss_feed (subject_id, object_id, created_by_id, created_at)
     SELECT subject_id, object_id, subject_id, CURRENT_TIMESTAMP - (((ordinality - 1) % $3) * INTERVAL '1 second')
     FROM UNNEST($1::uuid[], $2::uuid[]) WITH ORDINALITY AS s(subject_id, object_id, ordinality)
     ON CONFLICT DO NOTHING`,
    [friendFeedSubjects, friendFeedObjects, HEAVY_FEEDS_PER_FRIEND],
  )
  await write(
    `/* seedRecommendedRssFeedsHeavyTopics */ INSERT INTO relation__user__follow__topic (subject_id, object_id, created_by_id, created_at)
     SELECT $1::uuid, topic_id, $1::uuid, CURRENT_TIMESTAMP - ((ordinality - 1) * INTERVAL '1 second')
     FROM UNNEST($2::uuid[]) WITH ORDINALITY AS s(topic_id, ordinality)
     ON CONFLICT DO NOTHING`,
    [viewerId, topicIds],
  )
  await write(
    `/* seedRecommendedRssFeedsHeavyViewerFeeds */ INSERT INTO relation__user__follow__rss_feed (subject_id, object_id, created_by_id)
     SELECT $1::uuid, feed_id, $1::uuid FROM UNNEST($2::uuid[]) AS s(feed_id)
     ON CONFLICT DO NOTHING`,
    [viewerId, viewerFeeds],
  )
  await write(
    '/* vacuumRecommendedRssFeedsHeavy */ VACUUM (ANALYZE) relation__user__follow__user, relation__user__follow__rss_feed, relation__user__follow__topic',
  )
}

/** Removes the heavy friends/topics cohort so later scenarios keep their seeded row counts. */
export async function cleanupRecommendedRssFeedsHeavyFriendsAndTopics(): Promise<void> {
  const viewerId = seedUuid(RECOMMENDED_RSS_FEEDS_HEAVY_VIEWER_INDEX, '01')
  const firstFriend = seedUuid(FIRST_HEAVY_FRIEND_INDEX, '01')
  const lastFriend = seedUuid(FIRST_HEAVY_FRIEND_INDEX + HEAVY_FRIEND_COUNT - 1, '01')
  await write(
    `/* cleanupRecommendedRssFeedsHeavyFriends */ DELETE FROM relation__user__follow__user
     WHERE subject_id = $1 AND object_id BETWEEN $2 AND $3`,
    [viewerId, firstFriend, lastFriend],
  )
  await write(
    `/* cleanupRecommendedRssFeedsHeavyFriendFeeds */ DELETE FROM relation__user__follow__rss_feed
     WHERE subject_id = $1 OR subject_id BETWEEN $2 AND $3`,
    [viewerId, firstFriend, lastFriend],
  )
  await write(
    `/* cleanupRecommendedRssFeedsHeavyTopics */ DELETE FROM relation__user__follow__topic
     WHERE subject_id = $1`,
    [viewerId],
  )
  await write(
    '/* vacuumRecommendedRssFeedsHeavyCleanup */ VACUUM (ANALYZE) relation__user__follow__user, relation__user__follow__rss_feed, relation__user__follow__topic',
  )
}
