import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { refreshMaterializedView } from '@data-stores/psql/migrate'
import { createTestPost } from '../../test-helpers/entities/create-test-entities.mts'
import { createTestUser } from '../../test-helpers/entities/users.mts'
import {
  createTopHashtagPostSourceForTest,
  createTopHashtagRssSourceForTest,
  setTopHashtagPostRelationScoreForTest,
} from '../../test-helpers/entities/top-hashtags.mts'
import { insertTestRssFeedItem } from '../../test-helpers/entities/rss-feed-items.mts'
import { insertTestRssFeedWithUrlId } from '../../test-helpers/entities/rss-feeds.mts'
import { insertTestTopic } from '../../test-helpers/entities/topics/core.mts'
import { mergeTopicForTest, softDeleteTopic } from '../../test-helpers/entities/topics/deletion.mts'
import { softDeleteUser, suspendTestUser } from '../../test-helpers/entities/users-lifecycle.mts'
import { createUnlinkedTopicAlias } from '@services/topics/aliases'
import { searchTopHashtags } from '@services/topics/top-hashtags'

type PostExclusion =
  | 'suspended-contributor'
  | 'deleted-contributor'
  | 'suspended-creator'
  | 'zero-standing'

async function checkPostExclusion(kind: PostExclusion): Promise<void> {
  const suffix = crypto.randomUUID()
  const hashtag = `${kind}-${suffix}`
  const alias = await createUnlinkedTopicAlias(hashtag)
  const contributors = await Promise.all(Array.from({ length: 3 }, () => createTestUser()))
  const suspendedCreator = kind === 'suspended-creator' ? await createTestUser() : undefined
  for (const [index, contributor] of contributors.entries()) {
    const post = await createTestPost({
      user: kind === 'suspended-creator' && index === 0 ? suspendedCreator! : contributor!,
      title: `${kind} source ${index} ${suffix}`,
      privacy: 'public',
      broadcast: 'everyone',
    })
    await createTopHashtagPostSourceForTest({
      postId: post.id,
      topicAliasId: alias.id,
      userId: contributor!.id,
      authoredToken: `#${hashtag}`,
    })
    if (kind === 'zero-standing') {
      await setTopHashtagPostRelationScoreForTest({
        postId: post.id,
        topicAliasId: alias.id,
        score: 0,
      })
    }
  }
  if (kind === 'suspended-contributor') await suspendTestUser(contributors[0]!.id)
  if (kind === 'deleted-contributor') await softDeleteUser(contributors[0]!.id)
  if (kind === 'suspended-creator') await suspendTestUser(suspendedCreator!.id)
  await refreshMaterializedView('mv_top_hashtags')
  assert.deepEqual((await searchTopHashtags({ q: hashtag })).results, [], kind)
}

async function createRssHashtagItem(
  suffix: string,
  index: number,
  topicAliasId: string,
  hashtag: string,
): Promise<{ ownerId: string; topicId: string }> {
  const owner = await createTestUser({ administrator: true })
  const topicId = await insertTestTopic({
    name: `Eligibility RSS source ${index} ${suffix}`,
    slug: `eligibility-rss-source-${index}-${suffix}`,
    createdById: owner!.id,
  })
  const feed = await insertTestRssFeedWithUrlId({
    topicId,
    title: `Eligibility RSS source ${index} ${suffix}`,
  })
  const rssFeedItemId = await insertTestRssFeedItem({
    rssFeedId: feed.id,
    urlId: feed.rssFeedUrlId,
    guid: `eligibility-rss-${index}-${suffix}`,
    itemData: {
      link: `https://eligibility-rss-${index}-${suffix}.example.com/item`,
      title: `Eligibility RSS source ${index} ${suffix}`,
      isoDate: new Date().toISOString(),
    },
    contentSha256: createHash('sha256').update(`${suffix}-${index}`).digest(),
  })
  await createTopHashtagRssSourceForTest({
    rssFeedItemId,
    topicAliasId,
    authoredToken: `#${hashtag}`,
  })
  return { ownerId: owner!.id, topicId }
}

export async function checkHashtagEligibilityContracts(): Promise<void> {
  for (const kind of [
    'suspended-contributor',
    'deleted-contributor',
    'suspended-creator',
    'zero-standing',
  ] as const) {
    await checkPostExclusion(kind)
  }
  const suffix = crypto.randomUUID()
  const hashtag = `inactive-rss-owner-${suffix}`
  const alias = await createUnlinkedTopicAlias(hashtag)
  const sources = await Promise.all(
    [0, 1, 2].map(index => createRssHashtagItem(suffix, index, alias.id, hashtag)),
  )
  await softDeleteTopic(sources[0]!.topicId, sources[0]!.ownerId)
  const mergeDestinationId = await insertTestTopic({
    name: `RSS merge destination ${suffix}`,
    slug: `rss-merge-destination-${suffix}`,
    createdById: sources[1]!.ownerId,
  })
  await mergeTopicForTest(sources[1]!.topicId, mergeDestinationId, sources[1]!.ownerId)
  await refreshMaterializedView('mv_top_hashtags')
  assert.deepEqual((await searchTopHashtags({ q: hashtag })).results, [], 'inactive RSS owner')
}
