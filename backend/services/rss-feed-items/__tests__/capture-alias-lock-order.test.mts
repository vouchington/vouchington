import {
  lockPostPublicationRssFeedScopes,
  lockTopicAliasPublicationScopes,
  lockTopicRssFeedAttachmentLifecycle,
} from '@services/post-publication'
import { recordTopicMergePublicationChanges } from '@services/post-publication/capture-topic-merge'
import {
  beginTransaction,
  createTestTopic,
  insertTestRssFeedDirect,
  withTransactionOptions,
} from '@voucha/test-helpers'
import {
  gateTestTopicAliasPublicationLockQuery,
  setTestLocalLockTimeout,
} from '../../../test-helpers/publication-test-queries.mts'
type TransactionQuery = Parameters<typeof lockPostPublicationRssFeedScopes>[0]
import { describe, expect, it } from 'vitest'
import { createUnlinkedTopicAlias, linkTopicAlias } from '@services/topics/aliases'
import { upsertRssFeedItems } from '@services/rss-feed-items/upsert'
import { upsertRssFeedItemCategories } from '@services/rss-feed-items/categories'
import { lockTopicMergeAliasPublicationScopes } from '@services/topics/alias-publication-locks'

describe('alias capture lock order', () => {
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
  async function capturePublicationChanges(locked: PromiseWithResolvers<void>): Promise<void> {
    await using query = await beginTransaction()
    await withTransactionOptions({ query }, async scoped =>
      capture(gateTestTopicAliasPublicationLockQuery(scoped, locked)),
    )
    await query.commit()
  }
  const aliasLocked = Promise.withResolvers<void>()
  const mutation = capturePublicationChanges(aliasLocked)
  try {
    await aliasLocked.promise
    await expect(contendForAliasPublicationScope()).rejects.toMatchObject({ code: '55P03' })
  } finally {
    release.resolve()
  }
  await holder
  await expect(mutation).resolves.toBeUndefined()

  async function contendForAliasPublicationScope(): Promise<void> {
    await using query = await beginTransaction()
    await setTestLocalLockTimeout(query)
    await lockTopicAliasPublicationScopes(query, [aliasId])
    await query.commit()
  }
}
