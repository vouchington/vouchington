import { rssFeedMaintenance } from '@queues/rss-feed-maintenance/queues'
import { topicAliasUnlinkJobId } from '@queues/rss-feed-maintenance/enqueues/unlink-topic-alias'
import { upsertRssFeedItemCategories } from '@services/rss-feed-items/categories'
import { postPublicationWorkConfig } from '@services/post-publication/work-limits'
import { resolveRssFeedCategoryTopics } from '@services/rss-feeds/category-topic-resolution'
import {
  beginTransaction,
  createActivePostTopicAliasRelationForTest,
  createTestPost,
  createTestRssFeedItemWithUrl,
  createTestTopic,
  createTestUser,
  createTopHashtagPostSourceForTest,
  createTopHashtagRssSourceForTest,
  getPostHashtagSourcesForTest,
  getTestPostPublicationDirtyWorkForScope,
  insertTestRssFeedDirect,
  listTestPostPublicationImpactPostIds,
  listTestPostPublicationImpactRssFeedItemIds,
  listTestPostPublicationImpactTopicIds,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getTestRssFeedItemCategories } from '@voucha/test-helpers/entities/rss-feed-item-categories'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  claimTopicAlias,
  createTopicAliases,
  createUnlinkedTopicAlias,
  linkTopicAlias,
  unlinkTopicAlias,
} from '../aliases.mts'
import { getTopicAliasIdByKey, getTopicAliasRecords } from '../get-topic-aliases.mts'
import { searchTopicAliases } from '../search-topic-aliases.mts'
import {
  applyTopicAliasUnlinkPage,
  continueTopicAliasUnlink,
  selectTopicAliasUnlinkNextPage,
} from '../unlink-topic-alias-page.mts'

const UNLINK_PAGE_CAP = 16

describe('topic alias unlink pages', () => {
  it('returns before relation rows are enumerated and finishes them in bounded pages', async () => {
    const restore = overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
      topic_alias_unlink_page_size: 1,
    })
    onTestFinished(restore)
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user, name: `Unlink pages ${crypto.randomUUID()}` })
    const aliasText = `ordinary alias ${crypto.randomUUID()}`
    const [alias] = await createTopicAliases(topic.id, aliasText)
    if (!alias) throw new Error('Expected ordinary alias')
    const posts = await Promise.all([
      createTestPost({ user, title: `Unlink post a ${crypto.randomUUID()}` }),
      createTestPost({ user, title: `Unlink post b ${crypto.randomUUID()}` }),
    ])
    await Promise.all(
      posts.map(post =>
        createActivePostTopicAliasRelationForTest({
          postId: post.id,
          topicAliasId: alias.id,
          userId: user.id,
        }),
      ),
    )
    const feed = await insertTestRssFeedDirect({ topicId: topic.id })
    const item = await createTestRssFeedItemWithUrl(feed.id)
    await createTopHashtagRssSourceForTest({
      rssFeedItemId: item.id,
      topicAliasId: alias.id,
      authoredToken: `rss-${crypto.randomUUID()}`,
    })

    const detached = await unlinkTopicAlias(alias.id, { expectedTopicId: topic.id })

    expect(detached).toMatchObject({ id: alias.id, topic_id: null, alias: alias.alias })
    await using lookup = await beginTransaction()
    const firstPage = await selectTopicAliasUnlinkNextPage(lookup, alias.id, false)
    await lookup.rollback()
    expect(firstPage.phase).toBe('post_relations')
    await expect(
      rssFeedMaintenance.getJob(topicAliasUnlinkJobId(firstPage)),
    ).resolves.toMatchObject({
      data: { topicAliasId: alias.id, phase: 'post_relations' },
    })
    const accepted = await getTestPostPublicationDirtyWorkForScope({
      type: 'topic_alias',
      id: alias.id,
    })
    if (!accepted) throw new Error('Expected accepted unlink publication work')
    await expect(listTestPostPublicationImpactPostIds(accepted.id)).resolves.toEqual([])
    await expect(listTestPostPublicationImpactRssFeedItemIds(accepted.id)).resolves.toEqual([])
    await expect(listTestPostPublicationImpactTopicIds(accepted.id)).resolves.toEqual([topic.id])
    await expect(getTopicAliasRecords(topic.id)).resolves.toMatchObject({
      results: expect.not.arrayContaining([expect.objectContaining({ id: alias.id })]),
    })
    await expect(searchTopicAliases({ prefixQuery: alias.alias })).resolves.toMatchObject({
      results: [],
    })
    const repeated = await unlinkTopicAlias(alias.id, { expectedTopicId: topic.id })
    expect(repeated).toMatchObject({ id: alias.id, topic_id: null })
    const repeatedWork = await getTestPostPublicationDirtyWorkForScope({
      type: 'topic_alias',
      id: alias.id,
    })
    expect(repeatedWork?.generation).toBe(accepted.generation)

    await finishTopicAliasUnlink(alias.id)

    await expect(getTopicAliasIdByKey(alias.alias)).resolves.toBeUndefined()
    const finished = await getTestPostPublicationDirtyWorkForScope({
      type: 'topic_alias',
      id: alias.id,
    })
    if (!finished) throw new Error('Expected finished unlink publication work')
    await expect(listTestPostPublicationImpactPostIds(finished.id)).resolves.toEqual(
      expect.arrayContaining(posts.map(post => post.id)),
    )
    await expect(listTestPostPublicationImpactRssFeedItemIds(finished.id)).resolves.toEqual([
      item.id,
    ])
  })

  it('admits the page job only after the unlink transaction commits', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user, name: `Unlink commit ${crypto.randomUUID()}` })
    const [alias] = await createTopicAliases(topic.id, `ordinary alias ${crypto.randomUUID()}`)
    if (!alias) throw new Error('Expected ordinary alias')
    const post = await createTestPost({ user, title: `Unlink commit ${crypto.randomUUID()}` })
    await createActivePostTopicAliasRelationForTest({
      postId: post.id,
      topicAliasId: alias.id,
      userId: user.id,
    })

    await using transaction = await beginTransaction()
    await unlinkTopicAlias(alias.id, { query: transaction, expectedTopicId: topic.id })
    const page = await selectTopicAliasUnlinkNextPage(transaction, alias.id, false)
    await expect(rssFeedMaintenance.getJob(topicAliasUnlinkJobId(page))).resolves.toBeNull()
    await transaction.rollback()
    await expect(rssFeedMaintenance.getJob(topicAliasUnlinkJobId(page))).resolves.toBeNull()

    await unlinkTopicAlias(alias.id, { expectedTopicId: topic.id })
    await expect(rssFeedMaintenance.getJob(topicAliasUnlinkJobId(page))).resolves.toMatchObject({
      data: { topicAliasId: alias.id, phase: page.phase, pageCursor: page.pageCursor },
    })
  })

  it('retains publication keys and enqueues the next page after that page commits', async () => {
    const restore = overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
      topic_alias_unlink_page_size: 1,
    })
    onTestFinished(restore)
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user, name: `Unlink page commit ${crypto.randomUUID()}` })
    const [alias] = await createTopicAliases(topic.id, `ordinary alias ${crypto.randomUUID()}`)
    if (!alias) throw new Error('Expected ordinary alias')
    const posts = await Promise.all([
      createTestPost({ user, title: `Page commit a ${crypto.randomUUID()}` }),
      createTestPost({ user, title: `Page commit b ${crypto.randomUUID()}` }),
    ])
    await Promise.all(
      posts.map(post =>
        createActivePostTopicAliasRelationForTest({
          postId: post.id,
          topicAliasId: alias.id,
          userId: user.id,
        }),
      ),
    )
    await unlinkTopicAlias(alias.id, { expectedTopicId: topic.id })
    const work = await getTestPostPublicationDirtyWorkForScope({
      type: 'topic_alias',
      id: alias.id,
    })
    if (!work) throw new Error('Expected unlink publication work')
    await using planned = await beginTransaction()
    const page = await selectTopicAliasUnlinkNextPage(planned, alias.id, false)
    await planned.rollback()

    await using pageTransaction = await beginTransaction()
    const next = await applyTopicAliasUnlinkPage(page, { query: pageTransaction })
    if (!next) throw new Error('Expected another unlink page')
    await expect(listTestPostPublicationImpactPostIds(work.id)).resolves.toEqual([])
    await expect(rssFeedMaintenance.getJob(topicAliasUnlinkJobId(next))).resolves.toBeNull()
    await pageTransaction.commit()

    const captured = await listTestPostPublicationImpactPostIds(work.id)
    expect(captured).toHaveLength(1)
    expect(posts.map(post => post.id)).toContain(captured[0])
    await expect(rssFeedMaintenance.getJob(topicAliasUnlinkJobId(next))).resolves.toMatchObject({
      data: next,
    })
  })

  it('hides a pending hashtag from new categorisation and keeps its row after relations are removed', async () => {
    const restore = overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
      topic_alias_unlink_page_size: 1,
    })
    onTestFinished(restore)
    const user = await createTestUser({ administrator: true })
    const [topic, other] = await Promise.all([
      createTestTopic({ user, name: `Hashtag unlink ${crypto.randomUUID()}` }),
      createTestTopic({ user, name: `Hashtag other ${crypto.randomUUID()}` }),
    ])
    const alias = await createUnlinkedTopicAlias(`#pending-${crypto.randomUUID()}`)
    await linkTopicAlias(topic.id, alias.id)
    const post = await createTestPost({ user, title: `Hashtag unlink ${crypto.randomUUID()}` })
    await createTopHashtagPostSourceForTest({
      postId: post.id,
      topicAliasId: alias.id,
      userId: user.id,
      authoredToken: `#${alias.alias}`,
    })
    const feed = await insertTestRssFeedDirect({ topicId: topic.id })
    const categorized = await createTestRssFeedItemWithUrl(feed.id)
    await unlinkTopicAlias(alias.id, { expectedTopicId: topic.id })
    await createTopHashtagRssSourceForTest({
      rssFeedItemId: categorized.id,
      topicAliasId: alias.id,
      authoredToken: alias.alias,
    })

    await expect(linkTopicAlias(other.id, alias.id)).rejects.toMatchObject({ status: 409 })
    await expect(claimTopicAlias(other.id, alias.alias)).rejects.toMatchObject({ status: 409 })
    await expect(createTopicAliases(other.id, alias.alias)).rejects.toMatchObject({ status: 409 })
    await expect(createUnlinkedTopicAlias(alias.alias)).rejects.toMatchObject({ status: 409 })
    await expect(resolveRssFeedCategoryTopics(feed.id, [alias.alias])).resolves.toEqual([
      expect.objectContaining({ topic_id: null }),
    ])
    const freshItem = await createTestRssFeedItemWithUrl(feed.id)
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: freshItem.id, categories: [`#${alias.alias}`] },
    ])
    await expect(getTestRssFeedItemCategories(freshItem.id)).resolves.toEqual([
      expect.objectContaining({ topic_id: null }),
    ])

    await finishTopicAliasUnlink(alias.id)

    await expect(getTopicAliasIdByKey(alias.alias)).resolves.toBe(alias.id)
    await expect(getPostHashtagSourcesForTest(post.id)).resolves.toEqual([
      expect.objectContaining({ alias: alias.alias }),
    ])
    await expect(linkTopicAlias(other.id, alias.id)).resolves.toMatchObject({
      id: alias.id,
      topic_id: other.id,
    })
  })

  it('does not mark or enqueue a standalone hashtag', async () => {
    const alias = await createUnlinkedTopicAlias(`#standalone-${crypto.randomUUID()}`)
    await expect(unlinkTopicAlias(alias.id)).resolves.toMatchObject({
      id: alias.id,
      topic_id: null,
      alias: alias.alias,
    })
    await using lookup = await beginTransaction()
    const page = await selectTopicAliasUnlinkNextPage(lookup, alias.id, true)
    await lookup.rollback()
    await expect(rssFeedMaintenance.getJob(topicAliasUnlinkJobId(page))).resolves.toBeNull()
    await expect(createUnlinkedTopicAlias(alias.alias)).resolves.toMatchObject({ id: alias.id })
  })
})

async function finishTopicAliasUnlink(topicAliasId: string): Promise<void> {
  for (let page = 0; page < UNLINK_PAGE_CAP; page += 1) {
    const pending = await continueTopicAliasUnlink(topicAliasId)
    if (!pending) return
  }
  throw new Error(`Topic alias unlink did not finish for ${topicAliasId}`)
}
