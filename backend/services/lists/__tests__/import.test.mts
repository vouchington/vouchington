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
  insertTestCommunityListPostBatch,
  insertTestList,
  insertTestPostBatch,
  listPostItemExists,
  listPostItemCount,
  listRssFeedItemsFromFeedExist,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { IMPORT_POST_LIMIT, importCommunityList } from '../import.mts'
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
})

function viewerFor(userId: string) {
  return { kind: 'user' as const, userId, staffRole: null }
}

describe('importCommunityList visibility', () => {
  it('skips a community-list post the caller cannot see', async () => {
    const owner = await createTestUser()
    const stranger = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })
    const visiblePostId = await insertTestPost({
      title: `Visible import ${createRandomString(8)}`,
      slug: `visible-import-${createRandomString(8)}`,
      createdById: owner.id,
      markdown: 'visible',
    })
    const hiddenPostId = await insertTestPost({
      title: `Hidden import ${createRandomString(8)}`,
      slug: `hidden-import-${createRandomString(8)}`,
      createdById: stranger.id,
      markdown: 'hidden',
      privacy: 'private',
      broadcast: 'followers',
    })
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'post',
      entityId: visiblePostId,
      addedById: owner.id,
    })
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'post',
      entityId: hiddenPostId,
      addedById: owner.id,
    })
    const inserted = await insertTestList({
      ownerUserId: owner.id,
      name: `Visible import ${createRandomString(8)}`,
    })
    const list = await getManageableList(owner.id, inserted.id)
    const result = await importCommunityList(list, {
      communityId: community.id,
      viewer: viewerFor(owner.id),
    })

    expect(result.posts).toBe(1)
    expect(await listPostItemExists(inserted.id, visiblePostId)).toBe(true)
    expect(await listPostItemExists(inserted.id, hiddenPostId)).toBe(false)
  })

  it('skips an owned private post when the delegated private-write grant is absent', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const publicPostId = await insertTestPost({
      title: `Delegated public import ${createRandomString(8)}`,
      slug: `delegated-public-import-${createRandomString(8)}`,
      createdById: owner.id,
      markdown: 'public',
    })
    const privatePostId = await insertTestPost({
      title: `Delegated private import ${createRandomString(8)}`,
      slug: `delegated-private-import-${createRandomString(8)}`,
      createdById: owner.id,
      markdown: 'private',
      privacy: 'private',
      broadcast: 'followers',
    })
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'post',
      entityId: publicPostId,
      addedById: owner.id,
    })
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'post',
      entityId: privatePostId,
      addedById: owner.id,
    })
    const inserted = await insertTestList({
      ownerUserId: owner.id,
      name: `Delegated import ${createRandomString(8)}`,
    })
    const list = await getManageableList(owner.id, inserted.id)
    const result = await importCommunityList(list, {
      communityId: community.id,
      viewer: viewerFor(owner.id),
      delegated: { grantedScopes: ['lists:write'], credentialOwnerId: owner.id },
    })

    expect(result.posts).toBe(1)
    expect(await listPostItemExists(inserted.id, publicPostId)).toBe(true)
    expect(await listPostItemExists(inserted.id, privatePostId)).toBe(false)
  })

  it('imports at most the newest 500 community-list posts', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const postIds = await insertTestPostBatch(owner.id, IMPORT_POST_LIMIT + 1)
    const { oldestPostId, newestPostId } = await insertTestCommunityListPostBatch({
      communityId: community.id,
      postIds,
      addedById: owner.id,
    })
    const inserted = await insertTestList({
      ownerUserId: owner.id,
      name: `Capped import ${createRandomString(8)}`,
    })
    const list = await getManageableList(owner.id, inserted.id)
    const result = await importCommunityList(list, {
      communityId: community.id,
      viewer: viewerFor(owner.id),
    })

    expect(result.posts).toBe(IMPORT_POST_LIMIT)
    expect(await listPostItemExists(inserted.id, newestPostId)).toBe(true)
    expect(await listPostItemExists(inserted.id, oldestPostId)).toBe(false)
  })
})
