import { describe, it, expect } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  createTestUser,
  createRandomString,
  archiveTestCommunity,
  insertTestTopic,
  insertTestRssFeed,
  createTestRssFeedItemWithUrl,
  insertTestPost,
  insertTestCommunity,
  insertTestCommunityPostReview,
  insertTestCommunityListItem,
  insertTestCommunityListPostBatch,
  insertTestList,
  listPostItemExists,
} from '@voucha/test-helpers'
import { importCommunityList } from '../import.mts'
import { listImportConfig } from '../import-config.mts'
import { searchListItems } from '../items.mts'
import { archivePost } from '../../posts/archive.mts'
import { getManageableList } from '../manage.mts'

function viewerFor(userId: string) {
  return { kind: 'user' as const, userId, staffRole: null }
}

describe('importCommunityList visibility', () => {
  it('skips a post whose community was archived', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const postId = await insertTestPost({
      title: `Archived community import ${createRandomString(8)}`,
      slug: `archived-community-import-${createRandomString(8)}`,
      createdById: owner.id,
      communityId: community.id,
      markdown: 'archived community',
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: owner.id,
    })
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'post',
      entityId: postId,
      addedById: owner.id,
    })
    await archiveTestCommunity({ communityId: community.id, archivedById: owner.id })
    const inserted = await insertTestList({
      ownerUserId: owner.id,
      name: `Archived community import ${createRandomString(8)}`,
    })
    const list = await getManageableList(owner.id, inserted.id)
    const result = await importCommunityList(list, {
      communityId: community.id,
      viewer: viewerFor(owner.id),
    })
    expect(result.posts).toBe(0)
    expect(await listPostItemExists(list.id, postId)).toBe(false)
  })

  it('skips an archived post while importing an eligible sibling', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const archived = await insertTestPost({
      title: `Archived import ${createRandomString(8)}`,
      slug: `archived-import-${createRandomString(8)}`,
      createdById: owner.id,
      markdown: 'archived',
    })
    const eligible = await insertTestPost({
      title: `Eligible import ${createRandomString(8)}`,
      slug: `eligible-import-${createRandomString(8)}`,
      createdById: owner.id,
      markdown: 'eligible',
    })
    await Promise.all(
      [archived, eligible].map(entityId =>
        insertTestCommunityListItem({
          communityId: community.id,
          itemType: 'post',
          entityId,
          addedById: owner.id,
        }),
      ),
    )
    await archivePost(archived, owner.id)
    const inserted = await insertTestList({
      ownerUserId: owner.id,
      name: `Archived import ${createRandomString(8)}`,
    })
    const list = await getManageableList(owner.id, inserted.id)
    const result = await importCommunityList(list, {
      communityId: community.id,
      viewer: viewerFor(owner.id),
    })
    expect(result.posts).toBe(1)
    expect(await listPostItemExists(list.id, eligible)).toBe(true)
    expect(await listPostItemExists(list.id, archived)).toBe(false)
  })

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

  it('imports at most the configured number of newest community-list posts', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const postIds = await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
        insertTestPost({
          title: `Capped import post ${index} ${createRandomString(8)}`,
          slug: `capped-import-${index}-${createRandomString(8)}`,
          createdById: owner.id,
          markdown: 'test content',
        }),
      ),
    )
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
    const restore = overrideDynamicConfigFieldsForTest(listImportConfig, { max_items: 2 })
    let result: Awaited<ReturnType<typeof importCommunityList>>
    try {
      result = await importCommunityList(list, {
        communityId: community.id,
        viewer: viewerFor(owner.id),
      })
    } finally {
      restore()
    }

    expect(result.posts).toBe(2)
    expect(await listPostItemExists(inserted.id, newestPostId)).toBe(true)
    expect(await listPostItemExists(inserted.id, oldestPostId)).toBe(false)
  })

  it('caps feed items across all source feeds with the same configured limit', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const feeds = await Promise.all(
      [0, 1].map(async index => {
        const topicId = await insertTestTopic({
          name: `Feed import cap ${index} ${createRandomString(8)}`,
          slug: `feed-import-cap-${index}-${createRandomString(8)}`,
          createdById: owner.id,
        })
        const feedId = await insertTestRssFeed({
          topicId,
          title: `Feed cap ${index} ${createRandomString(8)}`,
        })
        await insertTestCommunityListItem({
          communityId: community.id,
          itemType: 'rss_feed',
          entityId: feedId,
          addedById: owner.id,
        })
        return feedId
      }),
    )
    const base = Date.now() - 3_000
    const oldest = await createTestRssFeedItemWithUrl(feeds[0]!, { createdAt: new Date(base) })
    const middle = await createTestRssFeedItemWithUrl(feeds[1]!, {
      createdAt: new Date(base + 1_000),
    })
    const newest = await createTestRssFeedItemWithUrl(feeds[0]!, {
      createdAt: new Date(base + 2_000),
    })
    const inserted = await insertTestList({
      ownerUserId: owner.id,
      name: `Feed capped ${createRandomString(8)}`,
    })
    const list = await getManageableList(owner.id, inserted.id)
    const restore = overrideDynamicConfigFieldsForTest(listImportConfig, { max_items: 2 })
    let result: Awaited<ReturnType<typeof importCommunityList>>
    try {
      result = await importCommunityList(list, {
        communityId: community.id,
        viewer: viewerFor(owner.id),
      })
    } finally {
      restore()
    }

    expect(result.items).toBe(2)
    const importedIds = (await searchListItems(inserted.id)).results
      .filter(item => item.item_type === 'rss_feed_item')
      .map(item => item.entity_id)
    expect(importedIds).toHaveLength(2)
    expect(importedIds).toContain(newest.id)
    expect(importedIds).toContain(middle.id)
    expect(importedIds).not.toContain(oldest.id)
  })
})
