import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const RECOMMENDED_RSS_FEEDS_POPULAR_FEED_INDEX = 2400
export const RECOMMENDED_RSS_FEEDS_CO_FOLLOWER_COUNT = 1000
export const RECOMMENDED_RSS_FEEDS_CO_FOLLOWER_FEEDS = 30
export const RECOMMENDED_RSS_FEEDS_VIEWER_EXTRA_FEEDS = 30

const FIRST_CO_FOLLOWER_INDEX = 5000
const FIRST_CANDIDATE_FEED_INDEX = 2000
const CANDIDATE_FEED_COUNT = 400

/** Rows this fixture adds to relation__user__follow__rss_feed. */
export const RECOMMENDED_RSS_FEEDS_FOLLOW_ROWS =
  1 +
  RECOMMENDED_RSS_FEEDS_VIEWER_EXTRA_FEEDS +
  RECOMMENDED_RSS_FEEDS_CO_FOLLOWER_COUNT * (1 + RECOMMENDED_RSS_FEEDS_CO_FOLLOWER_FEEDS)

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
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedExplainData */ INSERT INTO relation__user__follow__rss_feed (subject_id, object_id, created_by_id)
     SELECT subject_id, object_id, subject_id FROM UNNEST($1::uuid[], $2::uuid[]) AS s(subject_id, object_id)
     ON CONFLICT DO NOTHING`,
    [subjects, objects],
  )
  await transaction.commit()
}
