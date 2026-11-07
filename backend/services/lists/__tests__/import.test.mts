import { describe, it, expect, beforeAll } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  createTestUser,
  createRandomString,
  insertTestTopic,
  insertTestRssFeed,
  createTestRssFeedItemWithUrl,
  insertTestPost,
  deleteTestPost,
  insertTestCommunity,
  insertTestCommunityListItem,
  insertTestCommunityListPostBatch,
  insertTestList,
  listPostItemExists,
  listPostItemCount,
  listRssFeedItemsFromFeedExist,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { importCommunityList } from '../import.mts'
import { listImportConfig } from '../import-config.mts'
import { getManageableList, type ManageableList } from '../manage.mts'

describe('importCommunityList', () => {
  let user: PrivateUser
  let communityId: string
  let listId: string
  let list: ManageableList
  let postId: string
  let rssFeedId: string
  let rssFeedItemId: string

  beforeAll(async () => {
    user = await createTestUser()

    const community = await insertTestCommunity({ createdById: user.id })
    communityId = community.id

    const topicId = await insertTestTopic({
      name: `Import Topic ${createRandomString(8)}`,
      slug: `import-topic-${createRandomString(8)}`,
      createdById: user.id,
    })
    rssFeedId = await insertTestRssFeed({
      topicId,
      title: `Import Feed ${createRandomString(8)}`,
    })
    const item = await createTestRssFeedItemWithUrl(rssFeedId)
    rssFeedItemId = item.id

    postId = await insertTestPost({
      title: `Import Post ${createRandomString(8)}`,
      slug: `import-post-${createRandomString(8)}`,
      createdById: user.id,
      markdown: 'test content',
    })

    await insertTestCommunityListItem({
      communityId,
      itemType: 'post',
      entityId: postId,
      addedById: user.id,
    })
    await insertTestCommunityListItem({
      communityId,
      itemType: 'rss_feed',
      entityId: rssFeedId,
      addedById: user.id,
    })

    const inserted = await insertTestList({
      ownerUserId: user.id,
      name: `Import Test List ${createRandomString(8)}`,
    })
    listId = inserted.id
    list = await getManageableList(user.id, listId)
  })

  it('imports posts from the community', async () => {
    const result = await importCommunityList(list, { communityId, viewer: viewerFor(user.id) })
    expect(result.posts).toBeGreaterThanOrEqual(1)

    expect(await listPostItemExists(listId, postId)).toBe(true)
  })

  it('expands community feeds into rss_feed_items', async () => {
    expect(await listRssFeedItemsFromFeedExist(listId, rssFeedId, rssFeedItemId)).toBe(true)
  })

  it('is idempotent (re-import does not duplicate)', async () => {
    const result = await importCommunityList(list, { communityId, viewer: viewerFor(user.id) })
    expect(result.posts).toBe(0)

    expect(await listPostItemCount(listId, postId)).toBe(1)
  })

  it('stops the source page on a deleted newest membership', async () => {
    const community = await insertTestCommunity({ createdById: user.id })
    const older = await insertTestPost({
      title: `Older import ${createRandomString(8)}`,
      slug: `older-import-${createRandomString(8)}`,
      createdById: user.id,
      markdown: 'older',
    })
    const newer = await insertTestPost({
      title: `Newer import ${createRandomString(8)}`,
      slug: `newer-import-${createRandomString(8)}`,
      createdById: user.id,
      markdown: 'newer',
    })
    await insertTestCommunityListPostBatch({
      communityId: community.id,
      postIds: [older, newer],
      addedById: user.id,
    })
    await deleteTestPost(newer)

    const viewer = viewerFor(user.id)
    const restoreOne = overrideDynamicConfigFieldsForTest(listImportConfig, { max_items: 1 })
    try {
      const newestOnly = await importCommunityList(list, {
        communityId: community.id,
        viewer,
      })
      expect(newestOnly.posts).toBe(0)
      expect(await listPostItemExists(list.id, older)).toBe(false)
    } finally {
      restoreOne()
    }
    const restoreTwo = overrideDynamicConfigFieldsForTest(listImportConfig, { max_items: 2 })
    try {
      const withOlder = await importCommunityList(list, {
        communityId: community.id,
        viewer,
      })
      expect(withOlder.posts).toBe(1)
      expect(await listPostItemExists(list.id, older)).toBe(true)
      expect(await listPostItemExists(list.id, newer)).toBe(false)
    } finally {
      restoreTwo()
    }
  })
})

function viewerFor(userId: string) {
  return { kind: 'user' as const, userId, staffRole: null }
}
