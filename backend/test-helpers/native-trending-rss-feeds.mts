import { randomUUID } from 'node:crypto'
import { insertEntityRelation } from './entities/entity-relations.mts'
import { insertTestRssFeed } from './entities/rss-feeds.mts'
import { insertTestTopic } from './entities/topics/core.mts'
import { createTestUserDirect } from './entities/users-direct.mts'

/** Owned RSS feed for the single-process native materialized-view contract. */
export async function createNativeTrendingFeed(
  followCount: number,
  createdById?: string,
): Promise<string> {
  const ownerId =
    createdById ?? (await createTestUserDirect({ administrator: true, withEmail: true })).id
  const suffix = randomUUID()
  const topicId = await insertTestTopic({
    name: `Native Trending Feed Topic ${suffix}`,
    slug: `native-trending-feed-topic-${suffix}`,
    createdById: ownerId,
  })
  const feedId = await insertTestRssFeed({ topicId, title: `Native Trending Feed ${suffix}` })

  for (let index = 0; index < followCount; index++) {
    const follower = await createTestUserDirect({ withEmail: true })
    await insertEntityRelation('relation__user__follow__rss_feed', follower.id, feedId)
  }

  return feedId
}
