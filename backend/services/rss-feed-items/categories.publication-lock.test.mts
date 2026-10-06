import * as postPublication from '@services/post-publication'
import { beginTransaction, createTestTopic, insertTestRssFeedDirect } from '@voucha/test-helpers'
import { describe, expect, it, vi } from 'vitest'
import { createUnlinkedTopicAlias, linkTopicAlias } from '@services/topics/aliases'
import { upsertRssFeedItems } from './upsert.mts'
import { getRssFeedItemCategories, upsertRssFeedItemCategories } from './categories.mts'

describe('RSS feed item category publication locking', () => {
  it('locks matched topic-alias scopes before waiting on category item rows', async () => {
    expect.hasAssertions()
    const topic = await createTestTopic({ name: `Category alias lock ${crypto.randomUUID()}` })
    const alias = await createUnlinkedTopicAlias(`#category-lock-${crypto.randomUUID()}`)
    await linkTopicAlias(topic.id, alias.id)
    const feed = await insertTestRssFeedDirect({ topicId: topic.id })
    const [item] = await upsertRssFeedItems(feed.id, [
      {
        guid: crypto.randomUUID(),
        link: `https://example.com/${crypto.randomUUID()}`,
        title: 'Lock',
      },
    ])
    const rowLocked = Promise.withResolvers<void>()
    const releaseRow = Promise.withResolvers<void>()
    async function holdCategoryItemRow(): Promise<void> {
      await using query = await beginTransaction()
      await query(
        `/* category publication lock holder */ SELECT id FROM rss_feed_items WHERE id = $1::uuid FOR UPDATE`,
        [item!.id],
      )
      rowLocked.resolve()
      await releaseRow.promise
      await query.commit()
    }
    const holder = holdCategoryItemRow()
    await rowLocked.promise
    const aliasLock = observeAliasPublicationLock(alias.id)
    const upserting = upsertRssFeedItemCategories([
      { rss_feed_item_id: item!.id, categories: [`#${alias.alias}`] },
    ])
    try {
      await aliasLock.held
      await expect(contendForCategoryAliasScope()).rejects.toMatchObject({ code: '55P03' })
    } finally {
      aliasLock.restore()
      releaseRow.resolve()
    }
    await holder
    await expect(upserting).resolves.toBeUndefined()

    async function contendForCategoryAliasScope(): Promise<void> {
      await using query = await beginTransaction()
      await query(`/* category publication lock timeout */ SET LOCAL lock_timeout = '50ms'`)
      await postPublication.lockTopicAliasPublicationScopes(query, [alias.id])
      await query.commit()
    }
  })

  it('locks stale topic-alias scopes before waiting to remove a category row', async () => {
    expect.hasAssertions()
    const topic = await createTestTopic({
      name: `Stale category alias lock ${crypto.randomUUID()}`,
    })
    const alias = await createUnlinkedTopicAlias(`#stale-category-lock-${crypto.randomUUID()}`)
    await linkTopicAlias(topic.id, alias.id)
    const feed = await insertTestRssFeedDirect({ topicId: topic.id })
    const [item] = await upsertRssFeedItems(feed.id, [
      {
        guid: crypto.randomUUID(),
        link: `https://example.com/${crypto.randomUUID()}`,
        title: 'Stale lock',
      },
    ])
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: item!.id, categories: [`#${alias.alias}`] },
    ])

    const rowLocked = Promise.withResolvers<void>()
    const releaseRow = Promise.withResolvers<void>()
    async function holdStaleCategoryItemRow(): Promise<void> {
      await using query = await beginTransaction()
      await query(
        `/* stale category publication lock holder */ SELECT id FROM rss_feed_items WHERE id = $1::uuid FOR UPDATE`,
        [item!.id],
      )
      rowLocked.resolve()
      await releaseRow.promise
      await query.commit()
    }
    const holder = holdStaleCategoryItemRow()
    await rowLocked.promise
    const aliasLock = observeAliasPublicationLock(alias.id)
    const reconciling = upsertRssFeedItemCategories([
      { rss_feed_item_id: item!.id, categories: [] },
    ])
    try {
      await aliasLock.held
      await expect(contendForStaleCategoryAliasScope()).rejects.toMatchObject({ code: '55P03' })
    } finally {
      aliasLock.restore()
      releaseRow.resolve()
    }
    await holder
    await expect(reconciling).resolves.toBeUndefined()
    await expect(getRssFeedItemCategories(item!.id)).resolves.toEqual([])

    async function contendForStaleCategoryAliasScope(): Promise<void> {
      await using query = await beginTransaction()
      await query(`/* stale category publication lock timeout */ SET LOCAL lock_timeout = '50ms'`)
      await postPublication.lockTopicAliasPublicationScopes(query, [alias.id])
      await query.commit()
    }
  })
})

function observeAliasPublicationLock(aliasId: string): {
  held: Promise<void>
  restore: () => void
} {
  const held = Promise.withResolvers<void>()
  const lockScopes = postPublication.lockTopicAliasPublicationScopes
  const spy = vi
    .spyOn(postPublication, 'lockTopicAliasPublicationScopes')
    .mockImplementation(async (query, topicAliasIds) => {
      try {
        return await lockScopes(query, topicAliasIds)
      } finally {
        if (topicAliasIds.includes(aliasId)) held.resolve()
      }
    })
  return { held: held.promise, restore: () => spy.mockRestore() }
}
