import { rssFeedMaintenance } from '@queues/rss-feed-maintenance/queues'
import {
  enqueueTopicAliasUnlinkPages,
  topicAliasUnlinkJobId,
} from '@queues/rss-feed-maintenance/enqueues/unlink-topic-alias'
import { postPublicationWorkConfig } from '@services/post-publication/work-limits'
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
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createTopicAliases, createUnlinkedTopicAlias, unlinkTopicAlias } from '../aliases.mts'
import { getTopicAliasIdByKey } from '../get-topic-aliases.mts'
import {
  applyTopicAliasUnlinkPage,
  recoverTopicAliasUnlinks,
  selectTopicAliasUnlinkNextPage,
} from '../unlink-topic-alias-page.mts'
import { deleteTopicAliasUnlinkPhase } from '../unlink-topic-alias-phase.mts'

const NO_MORE_ALIASES = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

describe('topic alias unlink recovery', () => {
  it('re-admits pending aliases one bounded page at a time', async () => {
    const restore = overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
      topic_alias_unlink_page_size: 1,
    })
    onTestFinished(restore)
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user, name: `Recover unlink ${crypto.randomUUID()}` })
    const anchor = await createUnlinkedTopicAlias(`#recover-anchor-${crypto.randomUUID()}`)
    const aliases = await createTopicAliases(topic.id, [
      `recover a ${crypto.randomUUID()}`,
      `recover b ${crypto.randomUUID()}`,
    ])
    await Promise.all(
      aliases.map(alias => unlinkTopicAlias(alias.id, { expectedTopicId: topic.id })),
    )
    const [first] = aliases.toSorted((a, b) => a.id.localeCompare(b.id))

    await recoverTopicAliasUnlinks(anchor.id)

    await using lookup = await beginTransaction()
    const page = await selectTopicAliasUnlinkNextPage(lookup, first!.id, false)
    await lookup.rollback()
    await expect(rssFeedMaintenance.getJob(topicAliasUnlinkJobId(page))).resolves.not.toBeNull()
    await expect(
      rssFeedMaintenance.getJob(`unlink-topic-alias-recovery__${first!.id}`),
    ).resolves.not.toBeNull()
    await expect(recoverTopicAliasUnlinks(NO_MORE_ALIASES)).resolves.toBeUndefined()
  })

  it('admits several pages in one bulk call', async () => {
    const pages = [crypto.randomUUID(), crypto.randomUUID()].map(topicAliasId => ({
      topicAliasId,
      phase: 'finalize' as const,
      pageCursor: 'finalize',
    }))

    await enqueueTopicAliasUnlinkPages(pages)

    for (const page of pages) {
      await expect(rssFeedMaintenance.getJob(topicAliasUnlinkJobId(page))).resolves.not.toBeNull()
    }
  })

  it('drains post sources and ignores a page whose cursor went stale', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user, name: `Unlink sources ${crypto.randomUUID()}` })
    const [alias] = await createTopicAliases(topic.id, `sources alias ${crypto.randomUUID()}`)
    if (!alias) throw new Error('Expected ordinary alias')
    const post = await createTestPost({ user, title: `Unlink sources ${crypto.randomUUID()}` })
    await createTopHashtagPostSourceForTest({
      postId: post.id,
      topicAliasId: alias.id,
      userId: user.id,
      authoredToken: `#${alias.alias}`,
    })
    const relatedPost = await createTestPost({ user, title: `Unlink rel ${crypto.randomUUID()}` })
    await createActivePostTopicAliasRelationForTest({
      postId: relatedPost.id,
      topicAliasId: alias.id,
      userId: user.id,
    })
    await unlinkTopicAlias(alias.id, { expectedTopicId: topic.id })
    await using lookup = await beginTransaction()
    let page = await selectTopicAliasUnlinkNextPage(lookup, alias.id, false)
    await lookup.rollback()
    expect(page.phase).toBe('post_sources')

    const stale = { ...page, pageCursor: crypto.randomUUID() }
    await expect(applyTopicAliasUnlinkPage(stale)).resolves.toMatchObject({
      phase: 'post_sources',
      pageCursor: page.pageCursor,
    })
    await expect(getPostHashtagSourcesForTest(post.id)).resolves.toHaveLength(1)

    let next: Awaited<ReturnType<typeof applyTopicAliasUnlinkPage>> = page
    for (let n = 0; n < 8 && next; n += 1) {
      page = next
      next = await applyTopicAliasUnlinkPage(page)
    }

    await expect(getPostHashtagSourcesForTest(post.id)).resolves.toEqual([])
    await expect(getTopicAliasIdByKey(alias.alias)).resolves.toBeUndefined()
  })

  it('drains rss item relations after the categories', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user, name: `Unlink rss ${crypto.randomUUID()}` })
    const [alias] = await createTopicAliases(topic.id, `rss alias ${crypto.randomUUID()}`)
    if (!alias) throw new Error('Expected ordinary alias')
    const feed = await insertTestRssFeedDirect({ topicId: topic.id })
    const item = await createTestRssFeedItemWithUrl(feed.id)
    await createTopHashtagRssSourceForTest({
      rssFeedItemId: item.id,
      topicAliasId: alias.id,
      authoredToken: `rss-${crypto.randomUUID()}`,
    })
    await unlinkTopicAlias(alias.id, { expectedTopicId: topic.id })
    await using lookup = await beginTransaction()
    const first = await selectTopicAliasUnlinkNextPage(lookup, alias.id, false)
    await lookup.rollback()

    let next: Awaited<ReturnType<typeof applyTopicAliasUnlinkPage>> = first
    for (let n = 0; n < 8 && next; n += 1) next = await applyTopicAliasUnlinkPage(next)

    await expect(getTopicAliasIdByKey(alias.alias)).resolves.toBeUndefined()
  })

  it.each(['post_sources', 'post_relations', 'rss_item_categories', 'rss_item_relations'] as const)(
    'returns nothing for a stale %s cursor',
    async phase => {
      await using transaction = await beginTransaction()
      const alias = {
        id: crypto.randomUUID(),
        alias: 'stale',
        unlink_topic_id: crypto.randomUUID(),
      }

      await expect(
        deleteTopicAliasUnlinkPhase(transaction, alias, {
          topicAliasId: alias.id,
          phase,
          pageCursor: 'stale',
        }),
      ).resolves.toEqual({ postIds: [], rssFeedItemIds: [] })
    },
  )
})
