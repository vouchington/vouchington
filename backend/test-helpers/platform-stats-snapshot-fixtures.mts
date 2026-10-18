import { read, write } from '@data-stores/psql'
import { createTestPost, createTestTopic } from '@voucha/test-helpers/entities/create-test-entities'
import { insertTestDataPoint } from '@voucha/test-helpers/entities/data-points'
import { deleteTestPost } from '@voucha/test-helpers/entities/posts'
import {
  deleteRssFeedsByIds,
  insertTestRssFeedWithUrlId,
} from '@voucha/test-helpers/entities/rss-feeds'
import { softDeleteTopic } from '@voucha/test-helpers/entities/topics/deletion'
import { insertTestUrlHostname } from '@voucha/test-helpers/entities/url-hostnames'
import { setUrlHostnameVotes } from '@voucha/test-helpers/entities/url-hostnames/votes'
import { softDeleteUser } from '@voucha/test-helpers/entities/users-lifecycle'
import type { PrivateUser } from '@voucha/types/entities/user'
import sql from 'sql-template-strings'

export type PlatformStatsSnapshotFixtures = {
  feedHostnames: string[]
  votedHostnameIds: string[]
  feedIds: string[]
  postIds: string[]
  topicIds: string[]
}

export function createPlatformStatsSnapshotFixtures(token: string): PlatformStatsSnapshotFixtures {
  return {
    feedHostnames: [`platform-stats-feed-${token}.example.com`],
    votedHostnameIds: [],
    feedIds: [],
    postIds: [],
    topicIds: [],
  }
}

export async function insertPlatformStatsSnapshotFixtures(
  fixtures: PlatformStatsSnapshotFixtures,
  user: Readonly<PrivateUser>,
  token: string,
): Promise<void> {
  for (let index = 0; index < 2; index += 1) {
    const topic = await createTestTopic({ user, name: `Platform stats ${index} ${token}` })
    fixtures.topicIds.push(topic.id)
  }
  for (const [index, hostname] of fixtures.feedHostnames.entries()) {
    const feed = await insertTestRssFeedWithUrlId({
      topicId: fixtures.topicIds[index]!,
      title: `Platform stats feed ${index} ${token}`,
      rssFeedUrl: `https://${hostname}/feed.xml`,
      homePageUrl: `https://${hostname}/`,
    })
    fixtures.feedIds.push(feed.id)
  }
  for (let index = 0; index < 3; index += 1) {
    const post = await createTestPost({
      user,
      post_type: 'review',
      title: `Platform stats review ${index} ${token}`,
    })
    fixtures.postIds.push(post.id)
  }
  for (let index = 0; index < 4; index += 1) {
    fixtures.postIds.push(
      await insertTestDataPoint({
        title: `Platform stats data point ${index} ${token}`,
        slug: `platform-stats-data-${index}-${token}`,
        createdById: user.id,
      }),
    )
  }
  for (let index = 0; index < 5; index += 1) {
    const hostnameId = await insertTestUrlHostname({
      hostname: `platform-stats-voted-${index}-${token}.example.com`,
    })
    fixtures.votedHostnameIds.push(hostnameId)
    await setUrlHostnameVotes(hostnameId, 1, 0)
  }
}

export async function cleanupPlatformStatsSnapshotFixtures(
  fixtures: PlatformStatsSnapshotFixtures,
  userId: string | undefined,
): Promise<void> {
  await deleteRssFeedsByIds(fixtures.feedIds)
  for (const postId of fixtures.postIds) await deleteTestPost(postId)
  if (fixtures.topicIds.length > 0) {
    await write(sql`/* checkPlatformStatsSnapshot.clearTopicHostnames */
      UPDATE topics SET hostname_id = NULL WHERE id = ANY(${fixtures.topicIds}::uuid[])
    `)
    await write(sql`/* checkPlatformStatsSnapshot.clearHostnameTopics */
      UPDATE url_hostnames SET topic_id = NULL WHERE topic_id = ANY(${fixtures.topicIds}::uuid[])
    `)
  }
  const { rows: feedHostRows } = await read<{
    id: string
  }>(sql`/* checkPlatformStatsSnapshot.feedHostnames */
    SELECT id FROM url_hostnames WHERE hostname = ANY(${fixtures.feedHostnames}::text[])
  `)
  const feedHostnameIds = feedHostRows.map(row => row.id)
  if (feedHostnameIds.length > 0) {
    await write(sql`/* checkPlatformStatsSnapshot.deleteFeedUrls */
      DELETE FROM urls WHERE hostname_id = ANY(${feedHostnameIds}::uuid[])
    `)
  }
  await write(sql`/* checkPlatformStatsSnapshot.deleteOwnedHostnames */
    DELETE FROM url_hostnames
    WHERE hostname = ANY(${fixtures.feedHostnames}::text[])
       OR id = ANY(${fixtures.votedHostnameIds}::uuid[])
  `)
  if (userId) {
    for (const topicId of fixtures.topicIds) await softDeleteTopic(topicId, userId)
    await softDeleteUser(userId)
  }
}
