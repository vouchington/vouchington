import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  createRandomString,
  insertTestTopic,
  insertTestRssFeed,
  createTestRssFeedItemWithUrl,
  insertTestPost,
  insertTestCommunity,
  insertTestCommunityListItem,
  insertTestList,
  listPostItemExists,
  listPostItemCount,
  listRssFeedItemsFromFeedExist,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { importCommunityList } from '../import.mts'

describe('importCommunityList', () => {
  let user: PrivateUser
  let communityId: string
  let listId: string
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

    const list = await insertTestList({
      ownerUserId: user.id,
      name: `Import Test List ${createRandomString(8)}`,
    })
    listId = list.id
  })

  it('imports posts from the community', async () => {
    const result = await importCommunityList(user.id, { communityId, targetListId: listId })
    expect(result.posts).toBeGreaterThanOrEqual(1)

    expect(await listPostItemExists(listId, postId)).toBe(true)
  })

  it('expands community feeds into rss_feed_items', async () => {
    expect(await listRssFeedItemsFromFeedExist(listId, rssFeedId, rssFeedItemId)).toBe(true)
  })

  it('is idempotent (re-import does not duplicate)', async () => {
    const result = await importCommunityList(user.id, { communityId, targetListId: listId })
    expect(result.posts).toBe(0)

    expect(await listPostItemCount(listId, postId)).toBe(1)
  })

  it('throws 403 when currentUser does not own the list', async () => {
    const other = await createTestUser()
    await expect(
      importCommunityList(other.id, { communityId, targetListId: listId }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('throws 404 for unknown list', async () => {
    await expect(
      importCommunityList(user.id, {
        communityId,
        targetListId: '00000000-0000-7000-8000-000000000000',
      }),
    ).rejects.toMatchObject({ status: 404 })
  })
})
