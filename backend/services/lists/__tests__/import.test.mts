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
import { importCommunityList, importCommunityListPostsSourceSql } from '../import.mts'
import { getManageableList, type ManageableList } from '../manage.mts'
import { SYSTEM_ENTITY_RELATION_VIEWER } from '@services/entity-relations/viewer'

describe('importCommunityListPostsSourceSql', () => {
  it('separates the TRUE fallback from delegated post-type predicates', () => {
    const statement = importCommunityListPostsSourceSql(
      '00000000-0000-7000-8000-000000000101',
      '00000000-0000-7000-8000-000000000102',
      SYSTEM_ENTITY_RELATION_VIEWER,
      500,
      {
        grantedScopes: [],
        credentialOwnerId: '00000000-0000-7000-8000-000000000103',
      },
    )

    expect(statement.text).toMatch(/TRUE\s+AND access_post\.post_type/)
  })
})

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
