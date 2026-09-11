import { describe, expect, it } from 'vitest'
import { refreshMaterializedViewForTest } from '@voucha/test-helpers/refresh-materialized-view'
import {
  addTopHashtagRssFeedSourceForTest,
  archivePostForTopHashtagTest,
  createTestPost,
  createTestUser,
  createTopHashtagPostSourceForTest,
  createTopHashtagRssSourceForTest,
  insertTestCommunity,
  insertTestPendingCommunityPostReview,
  insertTestRssFeedItem,
  insertTestRssFeedWithUrlId,
  insertTestTopic,
  softDeleteTopic,
} from '@voucha/test-helpers'
import { createTopicAliases, createUnlinkedTopicAlias } from './aliases.mts'
import { searchTopHashtags } from './top-hashtags.mts'

async function createRssHashtagItem(options: {
  suffix: string
  index: number
  topicAliasId: string
  authoredToken: string
  publishedAt: Date
}) {
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
    contentSha256: Buffer.from(`${options.suffix}-${options.index}`.padEnd(32, '0')),
  })
  await createTopHashtagRssSourceForTest({
    rssFeedItemId,
    topicAliasId: options.topicAliasId,
    authoredToken: options.authoredToken,
  })
  return { feed, rssFeedItemId }
}

describe('searchTopHashtags', () => {
  it('treats LIKE metacharacters in a search query as literals', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const hashtag = `literal-like-${suffix}`
    const alias = await createUnlinkedTopicAlias(hashtag)
    for (let index = 0; index < 3; index++) {
      const contributor = await createTestUser()
      const post = await createTestPost({
        user: contributor!,
        title: `Literal LIKE source ${index} ${suffix}`,
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

    await refreshMaterializedViewForTest('mv_top_hashtags')
    const { results } = await searchTopHashtags({ q: '%' })

    expect(results).not.toContainEqual(expect.objectContaining({ topic_alias_id: alias.id }))
  })

  it('ranks eligible contributors, excludes archived posts, and paginates populated rows', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const hashtag = `#Top.Tag_${suffix}`
    const canonical = `top-tag-${suffix}`
    const alias = await createUnlinkedTopicAlias(hashtag)
    const posts = []
    for (let index = 0; index < 4; index++) {
      const user = await createTestUser()
      const post = await createTestPost({
        user: user!,
        title: `Top hashtag source ${index} ${suffix}`,
        privacy: 'public',
        broadcast: 'everyone',
      })
      await createTopHashtagPostSourceForTest({
        postId: post.id,
        topicAliasId: alias.id,
        userId: user!.id,
        authoredToken: hashtag,
      })
      posts.push({ post, user: user! })
    }
    await archivePostForTopHashtagTest(posts[3]!.post.id, posts[3]!.user.id)

    const rssOwner = await createTestUser({ administrator: true })
    const rssTopicId = await insertTestTopic({
      name: `Old RSS hashtag source ${suffix}`,
      slug: `old-rss-hashtag-source-${suffix}`,
      createdById: rssOwner!.id,
    })
    const feed = await insertTestRssFeedWithUrlId({
      topicId: rssTopicId,
      title: `Old RSS hashtag source ${suffix}`,
    })
    const itemData = {
      link: `https://old-rss-hashtag-${suffix}.example.com/item`,
      title: `Old RSS hashtag source ${suffix}`,
      isoDate: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
    }
    const oldRssItemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: feed.rssFeedUrlId,
      guid: `old-rss-hashtag-${suffix}`,
      itemData,
      contentSha256: Buffer.from(suffix.padEnd(32, '0')),
    })
    await createTopHashtagRssSourceForTest({
      rssFeedItemId: oldRssItemId,
      topicAliasId: alias.id,
      authoredToken: hashtag,
    })

    await refreshMaterializedViewForTest('mv_top_hashtags')
    const firstPage = await searchTopHashtags({ q: canonical, limit: 1 })
    expect(firstPage.results[0]).toMatchObject({
      hashtag,
      item_count: 3,
      contributor_count: 3,
    })
    const secondPage = await searchTopHashtags({
      q: canonical,
      limit: 1,
      after: firstPage.results[0],
    })
    expect(secondPage.results).toEqual([])
  })

  it('classifies an alias owned by a deleted topic as unlinked', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const owner = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Deleted Top Hashtag ${suffix}`,
      slug: `deleted-top-hashtag-${suffix}`,
      createdById: owner!.id,
    })
    const [alias] = await createTopicAliases(topicId, `deleted-top-hashtag-alias-${suffix}`)
    for (let index = 0; index < 3; index++) {
      const contributor = await createTestUser()
      const post = await createTestPost({
        user: contributor!,
        title: `Deleted topic hashtag source ${index} ${suffix}`,
        privacy: 'public',
        broadcast: 'everyone',
      })
      await createTopHashtagPostSourceForTest({
        postId: post.id,
        topicAliasId: alias!.id,
        userId: contributor!.id,
        authoredToken: `#deleted-top-hashtag-alias-${suffix}`,
      })
    }
    await softDeleteTopic(topicId, owner!.id)

    await refreshMaterializedViewForTest('mv_top_hashtags')
    const unlinked = await searchTopHashtags({
      q: `deleted-top-hashtag-alias-${suffix}`,
      mapping: 'unlinked',
    })
    const linked = await searchTopHashtags({
      q: `deleted-top-hashtag-alias-${suffix}`,
      mapping: 'linked',
    })

    expect(unlinked.results).toEqual([
      expect.objectContaining({ topic_alias_id: alias!.id, topic_id: null }),
    ])
    expect(linked.results).toEqual([])
  })

  it('excludes community posts that have not been publicly approved', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const owner = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner!.id,
      visibility: 'public',
    })
    const alias = await createUnlinkedTopicAlias(`pending-community-${suffix}`)

    for (let index = 0; index < 3; index++) {
      const contributor = await createTestUser()
      const post = await createTestPost({
        user: contributor!,
        title: `Pending community hashtag source ${index} ${suffix}`,
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
        topicAliasId: alias.id,
        userId: contributor!.id,
        authoredToken: `#pending-community-${suffix}`,
      })
    }

    await refreshMaterializedViewForTest('mv_top_hashtags')
    const results = await searchTopHashtags({ q: `pending-community-${suffix}` })

    expect(results.results).toEqual([])
  })

  it('counts a syndicated RSS item as one publisher contributor', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
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

    await refreshMaterializedViewForTest('mv_top_hashtags')
    const results = await searchTopHashtags({ q: hashtag })

    expect(results.results).toEqual([])
  })

  it('uses RSS publication time for hashtag recency', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const hashtag = `published-at-${suffix}`
    const alias = await createUnlinkedTopicAlias(hashtag)
    const publishedDates = [29, 28, 27].map(
      daysAgo => new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
    )
    for (const [index, publishedAt] of publishedDates.entries()) {
      await createRssHashtagItem({
        suffix,
        index,
        topicAliasId: alias.id,
        authoredToken: `#${hashtag}`,
        publishedAt,
      })
    }

    await refreshMaterializedViewForTest('mv_top_hashtags')
    const result = (await searchTopHashtags({ q: hashtag })).results[0]

    expect(result).toMatchObject({ item_count: 3, contributor_count: 3 })
    expect(result!.latest_content_at.getTime()).toBe(publishedDates[2]!.getTime())
  })
})
