import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { refreshMaterializedView } from '@data-stores/psql/migrate'
import {
  addTopHashtagRssFeedSourceForTest,
  createTopHashtagPostSourceForTest,
  createTopHashtagRssSourceForTest,
} from '../../test-helpers/entities/top-hashtags.mts'
import { createTestPost } from '../../test-helpers/entities/create-test-entities.mts'
import { createTestUser } from '../../test-helpers/entities/users.mts'
import { insertTestCommunity } from '../../test-helpers/entities/communities.mts'
import { insertTestPendingCommunityPostReview } from '../../test-helpers/entities/community-post-reviews.mts'
import { insertTestRssFeedItem } from '../../test-helpers/entities/rss-feed-items.mts'
import { insertTestRssFeedWithUrlId } from '../../test-helpers/entities/rss-feeds.mts'
import { insertTestTopic } from '../../test-helpers/entities/topics/core.mts'
import { createUnlinkedTopicAlias } from '@services/topics/aliases'
import { searchTopHashtags } from '@services/topics/top-hashtags'

async function createRssHashtagItem(options: {
  suffix: string
  index: number
  topicAliasId: string
  authoredToken: string
  publishedAt: Date
}): Promise<{ rssFeedItemId: string }> {
  const owner = await createTestUser({ administrator: true })
  const topicId = await insertTestTopic({
    name: `RSS hashtag source ${options.index} ${options.suffix}`,
    slug: `rss-hashtag-source-${options.index}-${options.suffix}`,
    createdById: owner!.id,
  })
  const feed = await insertTestRssFeedWithUrlId({
    topicId,
    title: `RSS hashtag source ${options.index} ${options.suffix}`,
  })
  const rssFeedItemId = await insertTestRssFeedItem({
    rssFeedId: feed.id,
    urlId: feed.rssFeedUrlId,
    guid: `rss-hashtag-${options.index}-${options.suffix}`,
    itemData: {
      link: `https://rss-hashtag-${options.index}-${options.suffix}.example.com/item`,
      title: `RSS hashtag source ${options.index} ${options.suffix}`,
      isoDate: options.publishedAt.toISOString(),
    },
    contentSha256: createHash('sha256').update(`${options.suffix}-${options.index}`).digest(),
  })
  await createTopHashtagRssSourceForTest({
    rssFeedItemId,
    topicAliasId: options.topicAliasId,
    authoredToken: options.authoredToken,
  })
  return { rssFeedItemId }
}

export async function checkHashtagSearchRssContracts(): Promise<void> {
  const pendingSuffix = crypto.randomUUID()
  const pendingOwner = await createTestUser()
  const community = await insertTestCommunity({
    createdById: pendingOwner!.id,
    visibility: 'public',
  })
  const pendingAlias = await createUnlinkedTopicAlias(`pending-community-${pendingSuffix}`)
  for (let index = 0; index < 3; index++) {
    const contributor = await createTestUser()
    const post = await createTestPost({
      user: contributor!,
      title: `Pending community hashtag source ${index} ${pendingSuffix}`,
      community_id: community.id,
      privacy: 'public',
      broadcast: 'everyone',
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId: post.id,
      submittedById: contributor!.id,
    })
    await createTopHashtagPostSourceForTest({
      postId: post.id,
      topicAliasId: pendingAlias.id,
      userId: contributor!.id,
      authoredToken: `#pending-community-${pendingSuffix}`,
    })
  }
  await refreshMaterializedView('mv_top_hashtags')
  assert.deepEqual(
    (await searchTopHashtags({ q: `pending-community-${pendingSuffix}` })).results,
    [],
  )

  const suffix = crypto.randomUUID()
  const hashtag = `syndicated-${suffix}`
  const alias = await createUnlinkedTopicAlias(hashtag)
  const { rssFeedItemId } = await createRssHashtagItem({
    suffix,
    index: 0,
    topicAliasId: alias.id,
    authoredToken: `#${hashtag}`,
    publishedAt: new Date(),
  })
  for (let index = 1; index < 3; index++) {
    const owner = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Syndicated feed ${index} ${suffix}`,
      slug: `syndicated-feed-${index}-${suffix}`,
      createdById: owner!.id,
    })
    const feed = await insertTestRssFeedWithUrlId({
      topicId,
      title: `Syndicated feed ${index} ${suffix}`,
    })
    await addTopHashtagRssFeedSourceForTest({ rssFeedId: feed.id, rssFeedItemId })
  }
  await refreshMaterializedView('mv_top_hashtags')
  assert.deepEqual((await searchTopHashtags({ q: hashtag })).results, [])

  const recencySuffix = crypto.randomUUID()
  const recencyHashtag = `published-at-${recencySuffix}`
  const recencyAlias = await createUnlinkedTopicAlias(recencyHashtag)
  const publishedDates = [29, 28, 27].map(
    daysAgo => new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
  )
  for (const [index, publishedAt] of publishedDates.entries()) {
    await createRssHashtagItem({
      suffix: recencySuffix,
      index,
      topicAliasId: recencyAlias.id,
      authoredToken: `#${recencyHashtag}`,
      publishedAt,
    })
  }
  await refreshMaterializedView('mv_top_hashtags')
  const latest = (await searchTopHashtags({ q: recencyHashtag })).results[0]
  assert.equal(latest?.item_count, 3)
  assert.equal(latest?.contributor_count, 3)
  assert.equal(latest?.latest_content_at.getTime(), publishedDates[2]!.getTime())
}
