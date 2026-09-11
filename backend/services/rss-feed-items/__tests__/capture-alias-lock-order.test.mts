import {
  lockPostPublicationRssFeedScopes,
  lockTopicAliasPublicationScopes,
  lockTopicRssFeedAttachmentLifecycle,
} from '@services/post-publication'
import { recordRssFeedHardDeletePublicationChange } from '@services/post-publication/capture-deletions'
import { recordTopicMergePublicationChanges } from '@services/post-publication/capture-topic-merge'
import type { TransactionQuery } from '@data-stores/psql'
import { beginTransaction, createTestTopic, insertTestRssFeedDirect } from '@voucha/test-helpers'
import { describe, expect, it, vi } from 'vitest'
import { createUnlinkedTopicAlias, linkTopicAlias } from '@services/topics/aliases'
import { upsertRssFeedItems } from '@services/rss-feed-items/upsert'
import { upsertRssFeedItemCategories } from '@services/rss-feed-items/categories'
import { lockTopicMergeAliasPublicationScopes } from '@services/topics/alias-publication-locks'

describe('alias capture lock order', () => {
  it('hard deletion locks retained aliases before feed item rows', async () => {
    expect.hasAssertions()
    const { feed, item, alias } = await createCategoryFixture()
    await expectAliasBeforeBlockedCapture(
      alias.id,
      query =>
        query(`SELECT id FROM rss_feed_items WHERE id = $1::uuid FOR UPDATE`, [item.id]).then(
          () => undefined,
        ),
      query => recordRssFeedHardDeletePublicationChange(query, feed.id),
    )
  })
  it('topic merge locks retained aliases before feed publication scopes', async () => {
    expect.hasAssertions()
    const { feed, alias, topic } = await createCategoryFixture()
    await expectAliasBeforeBlockedCapture(
      alias.id,
      query => lockPostPublicationRssFeedScopes(query, [feed.id]),
      async query => {
        const scopes = await lockTopicMergeAliasPublicationScopes(query, topic.id, topic.slug)
        await lockTopicRssFeedAttachmentLifecycle(query, topic.id)
        await recordTopicMergePublicationChanges(query, topic.id, scopes.lockedAliasIds)
      },
    )
  })
})

async function createCategoryFixture() {
  const hostname = `capture-alias-${crypto.randomUUID()}.example.test`
  const topic = await createTestTopic({ name: `Capture alias ${crypto.randomUUID()}` })
  const alias = await createUnlinkedTopicAlias(`#capture-alias-${crypto.randomUUID()}`)
  await linkTopicAlias(topic.id, alias.id)
  const feed = await insertTestRssFeedDirect({ topicId: topic.id })
  const [item] = await upsertRssFeedItems(feed.id, [
    {
      guid: crypto.randomUUID(),
      link: `https://${hostname}/${crypto.randomUUID()}`,
      title: 'Capture',
    },
  ])
  await upsertRssFeedItemCategories([
    { rss_feed_item_id: item!.id, categories: [`#${alias.alias}`] },
  ])
  return { feed: { ...feed, topic_id: topic.id }, item: item!, alias, topic }
}

async function expectAliasBeforeBlockedCapture(
  aliasId: string,
  holdNextScope: (query: TransactionQuery) => Promise<void>,
  capture: (query: TransactionQuery) => Promise<void>,
) {
  const locked = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  async function holdNextPublicationScope(): Promise<void> {
    await using query = await beginTransaction()
    await holdNextScope(query)
    locked.resolve()
    await release.promise
    await query.commit()
  }
  const holder = holdNextPublicationScope()
  await locked.promise
  async function capturePublicationChanges(): Promise<void> {
    await using query = await beginTransaction()
    await capture(query)
    await query.commit()
  }
  const mutation = capturePublicationChanges()
  try {
    await vi.waitFor(async () => {
      await expect(contendForAliasPublicationScope()).rejects.toMatchObject({ code: '55P03' })
    })
  } finally {
    release.resolve()
  }
  await holder
  await expect(mutation).resolves.toBeUndefined()

  async function contendForAliasPublicationScope(): Promise<void> {
    await using query = await beginTransaction()
    await query(`SET LOCAL lock_timeout = '50ms'`)
    await lockTopicAliasPublicationScopes(query, [aliasId])
    await query.commit()
  }
}
