import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  createRandomString,
  insertTestPost,
  insertTestTopic,
  createTestRssFeedItemWithUrl,
  insertTestRssFeed,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { createList } from '../lists.mts'
import { addListItem } from '../items.mts'
import { getListsContainingEntity } from '../lookup.mts'

describe('getListsContainingEntity', () => {
  let user: PrivateUser
  let listId: string
  let postId: string
  let rssFeedItemId: string

  beforeAll(async () => {
    user = await createTestUser()
    const list = await createList(WEB_PROVENANCE, user.id, {
      name: `Lookup Test ${createRandomString(8)}`,
    })
    listId = list.id

    const topicId = await insertTestTopic({
      name: `Lookup Topic ${createRandomString(8)}`,
      slug: `lookup-topic-${createRandomString(8)}`,
      createdById: user.id,
    })
    postId = await insertTestPost({
      title: `Lookup Post ${createRandomString(8)}`,
      slug: `lookup-post-${createRandomString(8)}`,
      createdById: user.id,
      markdown: 'test',
    })
    const feedId = await insertTestRssFeed({
      topicId,
      title: `Lookup Feed ${createRandomString(8)}`,
    })
    const item = await createTestRssFeedItemWithUrl(feedId)
    rssFeedItemId = item.id
  })

  it('returns list IDs containing a post', async () => {
    await addListItem(listId, 'post', postId)
    const listIds = await getListsContainingEntity(user.id, 'post', postId)
    expect(listIds).toContain(listId)
  })

  it('returns list IDs containing an rss_feed_item', async () => {
    await addListItem(listId, 'rss_feed_item', rssFeedItemId)
    const listIds = await getListsContainingEntity(user.id, 'rss_feed_item', rssFeedItemId)
    expect(listIds).toContain(listId)
  })

  it('returns empty array when entity not in any list', async () => {
    const listIds = await getListsContainingEntity(
      user.id,
      'post',
      '00000000-0000-7000-8000-000000000000',
    )
    expect(listIds).toEqual([])
  })

  it('does not return lists belonging to other users', async () => {
    const otherUser = await createTestUser()
    const listIds = await getListsContainingEntity(otherUser.id, 'post', postId)
    expect(listIds).not.toContain(listId)
  })
})
