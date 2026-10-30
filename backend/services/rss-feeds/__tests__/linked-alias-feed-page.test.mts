import { randomUUID } from 'node:crypto'
import { createTopicAliases } from '@services/topics/aliases'
import { lockTopicRssFeedAttachmentLifecycles } from '@services/post-publication/lock'
import {
  beginTransaction,
  createTestRssFeedWithTiming,
  createTestTopic,
  deleteTopicAliasCategoryMappingDirtyRowsForTest,
  getTestPostgresBackendProcessId,
  getTestRssFeedCategories,
  insertTestRssFeedCategory,
  setTestRssFeedCategoryTopicId,
} from '@voucha/test-helpers'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { describe, expect, it, onTestFinished } from 'vitest'
import { backfillLinkedAliasFeedPage } from '../linked-alias-feed-page.mts'

describe('linked alias feed page', () => {
  it('retries when a locked category changes to NULL before the page update', async () => {
    const owner = await createTestTopic()
    const previous = await createTestTopic()
    const aliasText = `feed-relink-${randomUUID()}`
    const [alias] = await createTopicAliases(owner.id, aliasText)
    if (!alias) throw new Error('Expected linked topic alias')
    onTestFinished(() => deleteTopicAliasCategoryMappingDirtyRowsForTest([alias.id]))
    const feedId = await createTestRssFeedWithTiming(owner.id)
    const categoryIdentityId = await insertTestRssFeedCategory(feedId, aliasText, previous.id)
    const page = [{ rss_feed_id: feedId, category_identity_id: categoryIdentityId }]

    await using holder = await beginTransaction()
    await setTestRssFeedCategoryTopicId(feedId, categoryIdentityId, null, holder)
    const holderProcessId = await getTestPostgresBackendProcessId(holder)
    await withTestOwnedPostgresWait(
      {
        holderProcessId,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'backfillLinkedAliasFeedPage lockCategories',
        releaseHolder: () => holder[Symbol.asyncDispose](),
      },
      async waitForLock => {
        const pending = backfillLinkedAliasFeedPage(alias.id, aliasText, owner.id, page)
        void pending.catch(() => {})
        await waitForLock(pending)
        await holder.commit()
        await expect(pending).rejects.toMatchObject({ status: 409 })
      },
    )

    await expect(getTestRssFeedCategories(feedId)).resolves.toContainEqual({
      category_text: aliasText,
      topic_id: null,
    })
    await expect(backfillLinkedAliasFeedPage(alias.id, aliasText, owner.id, page)).resolves.toBe(1)
    await expect(getTestRssFeedCategories(feedId)).resolves.toContainEqual({
      category_text: aliasText,
      topic_id: owner.id,
    })
    await expect(backfillLinkedAliasFeedPage(alias.id, aliasText, owner.id, page)).resolves.toBe(0)
    await expect(getTestRssFeedCategories(feedId)).resolves.toContainEqual({
      category_text: aliasText,
      topic_id: owner.id,
    })
  })

  it('rechecks a category changed by another attachment writer while waiting for topic fences', async () => {
    const owner = await createTestTopic()
    const previous = await createTestTopic()
    const aliasText = `feed-attachment-race-${randomUUID()}`
    const [alias] = await createTopicAliases(owner.id, aliasText)
    if (!alias) throw new Error('Expected linked topic alias')
    onTestFinished(() => deleteTopicAliasCategoryMappingDirtyRowsForTest([alias.id]))
    const feedId = await createTestRssFeedWithTiming(owner.id)
    const categoryIdentityId = await insertTestRssFeedCategory(feedId, aliasText, previous.id)
    const page = [{ rss_feed_id: feedId, category_identity_id: categoryIdentityId }]

    await using holder = await beginTransaction()
    await lockTopicRssFeedAttachmentLifecycles(holder, [owner.id, previous.id])
    const holderProcessId = await getTestPostgresBackendProcessId(holder)
    await withTestOwnedPostgresWait(
      {
        holderProcessId,
        pool: 'write',
        lock: { kind: 'advisory', key: `topic-rss-feed-attachment:${owner.id.toLowerCase()}` },
        queryMarker: 'lockTopicRssFeedAttachmentLifecycles',
        releaseHolder: () => holder[Symbol.asyncDispose](),
      },
      async waitForLock => {
        const pending = backfillLinkedAliasFeedPage(alias.id, aliasText, owner.id, page)
        void pending.catch(() => {})
        await waitForLock(pending)
        await setTestRssFeedCategoryTopicId(feedId, categoryIdentityId, owner.id, holder)
        await holder.commit()
        await expect(pending).rejects.toMatchObject({ status: 409 })
      },
    )
    await expect(backfillLinkedAliasFeedPage(alias.id, aliasText, owner.id, page)).resolves.toBe(0)
    await expect(getTestRssFeedCategories(feedId)).resolves.toContainEqual({
      category_text: aliasText,
      topic_id: owner.id,
    })
  })
})
