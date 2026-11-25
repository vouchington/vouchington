import { describe, expect, it, onTestFinished } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  createRandomString,
  createTestRssFeedItemWithUrl,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityListItem,
  insertTestList,
  insertTestRssFeed,
  insertTestTopic,
} from '@voucha/test-helpers'
import { importCommunityList } from '../import.mts'
import { listImportConfig } from '../import-config.mts'
import { searchListItems } from '../items.mts'
import { getManageableList } from '../manage.mts'

describe('community list feed import cap', () => {
  it('copies only the configured item count from each feed', async () => {
    await listImportConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(listImportConfig, { import_feed_item_limit: 1 }),
    )
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const suffix = createRandomString(8)
    const topicId = await insertTestTopic({
      createdById: owner.id,
      name: `Item cap ${suffix}`,
      slug: `item-cap-${suffix}`,
    })
    const feedId = await insertTestRssFeed({ topicId, title: `Item cap ${suffix}` })
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'rss_feed',
      entityId: feedId,
      addedById: owner.id,
    })
    const first = await createTestRssFeedItemWithUrl(feedId)
    const second = await createTestRssFeedItemWithUrl(feedId)
    const inserted = await insertTestList({ ownerUserId: owner.id, name: `Item cap ${suffix}` })
    const list = await getManageableList(owner.id, inserted.id)

    await expect(
      importCommunityList(list, {
        communityId: community.id,
        viewer: { kind: 'user', userId: owner.id, staffRole: null },
      }),
    ).resolves.toMatchObject({ items: 1 })
    const importedIds = (await searchListItems(list.id)).results.map(item => item.entity_id)
    expect(importedIds).toEqual([second.id])
    expect(importedIds).not.toContain(first.id)
  })

  it('reads at most the configured number of feeds from an existing over-cap list', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const feeds = await Promise.all(
      Array.from({ length: 3 }, async () => {
        const suffix = createRandomString(8)
        const topicId = await insertTestTopic({
          name: `Over-cap feed ${suffix}`,
          slug: `over-cap-feed-${suffix}`,
          createdById: owner.id,
        })
        const feedId = await insertTestRssFeed({ topicId, title: `Over-cap ${suffix}` })
        await insertTestCommunityListItem({
          communityId: community.id,
          itemType: 'rss_feed',
          entityId: feedId,
          addedById: owner.id,
        })
        const item = await createTestRssFeedItemWithUrl(feedId)
        return { feedId, itemId: item.id }
      }),
    )
    const selected = feeds.toSorted((a, b) => a.feedId.localeCompare(b.feedId)).slice(0, 2)
    const inserted = await insertTestList({
      ownerUserId: owner.id,
      name: `Over-cap import ${createRandomString(8)}`,
    })
    const list = await getManageableList(owner.id, inserted.id)
    const restore = overrideDynamicConfigFieldsForTest(listImportConfig, {
      max_community_list_feeds: 2,
    })
    try {
      const result = await importCommunityList(list, {
        communityId: community.id,
        viewer: { kind: 'user', userId: owner.id, staffRole: null },
      })
      expect(result.items).toBe(2)
      const importedIds = (await searchListItems(inserted.id)).results.map(item => item.entity_id)
      expect(importedIds).toEqual(expect.arrayContaining(selected.map(feed => feed.itemId)))
      expect(importedIds).not.toContain(
        feeds.find(feed => !selected.some(chosen => chosen.feedId === feed.feedId))!.itemId,
      )
    } finally {
      restore()
    }
  })
})
