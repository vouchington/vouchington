import { describe, expect, it } from 'vitest'
import { refreshMaterializedViewForTest } from '@voucha/test-helpers/refresh-materialized-view'
import {
  createTestPost,
  createTestUser,
  createTopHashtagPostSourceForTest,
  createTopHashtagRssSourceForTest,
  insertTestRssFeedItem,
  insertTestRssFeedWithUrlId,
  insertTestTopic,
  mergeTopicForTest,
  softDeleteTopic,
  setTopHashtagPostRelationScoreForTest,
  softDeleteUser,
  suspendTestUser,
} from '@voucha/test-helpers'
import { createUnlinkedTopicAlias } from './aliases.mts'
import { searchTopHashtags } from './top-hashtags.mts'

async function createRssHashtagItem(options: {
  suffix: string
  index: number
  topicAliasId: string
  hashtag: string
}) {
  const owner = await createTestUser({ administrator: true })
  const topicId = await insertTestTopic({
    name: `Eligibility RSS source ${options.index} ${options.suffix}`,
    slug: `eligibility-rss-source-${options.index}-${options.suffix}`,
    createdById: owner!.id,
  })
  const feed = await insertTestRssFeedWithUrlId({
    topicId,
    title: `Eligibility RSS source ${options.index} ${options.suffix}`,
  })
  const rssFeedItemId = await insertTestRssFeedItem({
    rssFeedId: feed.id,
    urlId: feed.rssFeedUrlId,
    guid: `eligibility-rss-${options.index}-${options.suffix}`,
    itemData: {
      link: `https://eligibility-rss-${options.index}-${options.suffix}.example.com/item`,
      title: `Eligibility RSS source ${options.index} ${options.suffix}`,
      isoDate: new Date().toISOString(),
    },
    contentSha256: Buffer.from(`${options.suffix}-${options.index}`.padEnd(32, '0')),
  })
  await createTopHashtagRssSourceForTest({
    rssFeedItemId,
    topicAliasId: options.topicAliasId,
    authoredToken: `#${options.hashtag}`,
  })
  return { ownerId: owner!.id, topicId }
}

describe('searchTopHashtags eligibility', () => {
  it('excludes posts from actively suspended contributors', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const hashtag = `suspended-contributor-${suffix}`
    const alias = await createUnlinkedTopicAlias(hashtag)
    const contributors = []
    for (let index = 0; index < 3; index++) {
      const contributor = await createTestUser()
      const post = await createTestPost({
        user: contributor!,
        title: `Suspended contributor ${index} ${suffix}`,
        privacy: 'public',
        broadcast: 'everyone',
      })
      await createTopHashtagPostSourceForTest({
        postId: post.id,
        topicAliasId: alias.id,
        userId: contributor!.id,
        authoredToken: `#${hashtag}`,
      })
      contributors.push(contributor!)
    }
    await suspendTestUser(contributors[0]!.id)

    await refreshMaterializedViewForTest('mv_top_hashtags')

    expect((await searchTopHashtags({ q: hashtag })).results).toEqual([])
  })

  it('excludes posts from soft-deleted source contributors', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const hashtag = `deleted-contributor-${suffix}`
    const alias = await createUnlinkedTopicAlias(hashtag)
    const contributors = await Promise.all(Array.from({ length: 3 }, () => createTestUser()))
    for (const [index, contributor] of contributors.entries()) {
      const post = await createTestPost({
        user: contributor!,
        title: `Deleted contributor ${index} ${suffix}`,
        privacy: 'public',
        broadcast: 'everyone',
      })
      await createTopHashtagPostSourceForTest({
        postId: post.id,
        topicAliasId: alias.id,
        userId: contributor!.id,
        authoredToken: `#${hashtag}`,
      })
    }
    await softDeleteUser(contributors[0]!.id)

    await refreshMaterializedViewForTest('mv_top_hashtags')

    expect((await searchTopHashtags({ q: hashtag })).results).toEqual([])
  })

  it('excludes posts created by actively suspended users even with active source contributors', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const hashtag = `suspended-post-creator-${suffix}`
    const alias = await createUnlinkedTopicAlias(hashtag)
    const suspendedCreator = await createTestUser()
    const sourceContributors = await Promise.all(Array.from({ length: 3 }, () => createTestUser()))
    for (const [index, contributor] of sourceContributors.entries()) {
      const post = await createTestPost({
        user: index === 0 ? suspendedCreator : contributor!,
        title: `Suspended post creator ${index} ${suffix}`,
        privacy: 'public',
        broadcast: 'everyone',
      })
      await createTopHashtagPostSourceForTest({
        postId: post.id,
        topicAliasId: alias.id,
        userId: contributor!.id,
        authoredToken: `#${hashtag}`,
      })
    }
    await suspendTestUser(suspendedCreator.id)

    await refreshMaterializedViewForTest('mv_top_hashtags')

    expect((await searchTopHashtags({ q: hashtag })).results).toEqual([])
  })

  it('excludes post hashtag sources whose alias relation no longer has positive standing', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const hashtag = `zero-standing-${suffix}`
    const alias = await createUnlinkedTopicAlias(hashtag)
    for (let index = 0; index < 3; index++) {
      const contributor = await createTestUser()
      const post = await createTestPost({
        user: contributor,
        title: `Zero-standing source ${index} ${suffix}`,
        privacy: 'public',
        broadcast: 'everyone',
      })
      await createTopHashtagPostSourceForTest({
        postId: post.id,
        topicAliasId: alias.id,
        userId: contributor.id,
        authoredToken: `#${hashtag}`,
      })
      await setTopHashtagPostRelationScoreForTest({
        postId: post.id,
        topicAliasId: alias.id,
        score: 0,
      })
    }

    await refreshMaterializedViewForTest('mv_top_hashtags')

    expect((await searchTopHashtags({ q: hashtag })).results).toEqual([])
  })

  it('excludes RSS sources whose owning topic is deleted or merged', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const hashtag = `inactive-rss-owner-${suffix}`
    const alias = await createUnlinkedTopicAlias(hashtag)
    const sources = await Promise.all(
      [0, 1, 2].map(index =>
        createRssHashtagItem({ suffix, index, topicAliasId: alias.id, hashtag }),
      ),
    )
    await softDeleteTopic(sources[0]!.topicId, sources[0]!.ownerId)
    const mergeDestinationId = await insertTestTopic({
      name: `RSS merge destination ${suffix}`,
      slug: `rss-merge-destination-${suffix}`,
      createdById: sources[1]!.ownerId,
    })
    await mergeTopicForTest(sources[1]!.topicId, mergeDestinationId, sources[1]!.ownerId)

    await refreshMaterializedViewForTest('mv_top_hashtags')

    expect((await searchTopHashtags({ q: hashtag })).results).toEqual([])
  })
})
