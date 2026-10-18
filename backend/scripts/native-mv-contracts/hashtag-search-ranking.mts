import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { refreshMaterializedView } from '@data-stores/psql/migrate'
import {
  archivePostForTopHashtagTest,
  createTopHashtagPostSourceForTest,
  createTopHashtagRssSourceForTest,
} from '../../test-helpers/entities/top-hashtags.mts'
import { createTestPost } from '../../test-helpers/entities/create-test-entities.mts'
import { createTestUser } from '../../test-helpers/entities/users.mts'
import { insertTestRssFeedItem } from '../../test-helpers/entities/rss-feed-items.mts'
import { insertTestRssFeedWithUrlId } from '../../test-helpers/entities/rss-feeds.mts'
import { insertTestTopic } from '../../test-helpers/entities/topics/core.mts'
import { softDeleteTopic } from '../../test-helpers/entities/topics/deletion.mts'
import { createTopicAliases, createUnlinkedTopicAlias } from '@services/topics/aliases'
import { searchTopHashtags } from '@services/topics/top-hashtags'

export async function checkHashtagSearchRankingContracts(): Promise<void> {
  const literalSuffix = crypto.randomUUID()
  const literalHashtag = `literal-like-${literalSuffix}`
  const literalAlias = await createUnlinkedTopicAlias(literalHashtag)
  for (let index = 0; index < 3; index++) {
    const contributor = await createTestUser()
    const post = await createTestPost({
      user: contributor!,
      title: `Literal LIKE source ${index} ${literalSuffix}`,
      privacy: 'public',
      broadcast: 'everyone',
    })
    await createTopHashtagPostSourceForTest({
      postId: post.id,
      topicAliasId: literalAlias.id,
      userId: contributor!.id,
      authoredToken: `#${literalHashtag}`,
    })
  }
  await refreshMaterializedView('mv_top_hashtags')
  const literalResults = (await searchTopHashtags({ q: '%' })).results
  assert.ok(!literalResults.some(row => row.topic_alias_id === literalAlias.id))

  const suffix = crypto.randomUUID()
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
  const oldRssItemId = await insertTestRssFeedItem({
    rssFeedId: feed.id,
    urlId: feed.rssFeedUrlId,
    guid: `old-rss-hashtag-${suffix}`,
    itemData: {
      link: `https://old-rss-hashtag-${suffix}.example.com/item`,
      title: `Old RSS hashtag source ${suffix}`,
      isoDate: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
    },
    contentSha256: createHash('sha256').update(suffix).digest(),
  })
  await createTopHashtagRssSourceForTest({
    rssFeedItemId: oldRssItemId,
    topicAliasId: alias.id,
    authoredToken: hashtag,
  })
  await refreshMaterializedView('mv_top_hashtags')
  const firstPage = await searchTopHashtags({ q: canonical, limit: 1 })
  assert.equal(firstPage.results[0]?.hashtag, hashtag)
  assert.equal(firstPage.results[0]?.item_count, 3)
  assert.equal(firstPage.results[0]?.contributor_count, 3)
  const secondPage = await searchTopHashtags({
    q: canonical,
    limit: 1,
    after: firstPage.results[0],
  })
  assert.deepEqual(secondPage.results, [])

  const deletedSuffix = crypto.randomUUID()
  const owner = await createTestUser({ administrator: true })
  const topicId = await insertTestTopic({
    name: `Deleted Top Hashtag ${deletedSuffix}`,
    slug: `deleted-top-hashtag-${deletedSuffix}`,
    createdById: owner!.id,
  })
  const [deletedAlias] = await createTopicAliases(
    topicId,
    `deleted-top-hashtag-alias-${deletedSuffix}`,
  )
  for (let index = 0; index < 3; index++) {
    const contributor = await createTestUser()
    const post = await createTestPost({
      user: contributor!,
      title: `Deleted topic hashtag source ${index} ${deletedSuffix}`,
      privacy: 'public',
      broadcast: 'everyone',
    })
    await createTopHashtagPostSourceForTest({
      postId: post.id,
      topicAliasId: deletedAlias!.id,
      userId: contributor!.id,
      authoredToken: `#deleted-top-hashtag-alias-${deletedSuffix}`,
    })
  }
  await softDeleteTopic(topicId, owner!.id)
  await refreshMaterializedView('mv_top_hashtags')
  const query = `deleted-top-hashtag-alias-${deletedSuffix}`
  const unlinked = await searchTopHashtags({ q: query, mapping: 'unlinked' })
  const linked = await searchTopHashtags({ q: query, mapping: 'linked' })
  assert.equal(unlinked.results.length, 1)
  assert.equal(unlinked.results[0]?.topic_alias_id, deletedAlias!.id)
  assert.equal(unlinked.results[0]?.topic_id, null)
  assert.deepEqual(linked.results, [])
}
