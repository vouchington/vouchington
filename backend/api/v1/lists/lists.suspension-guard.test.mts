import { afterEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createRandomString,
  createTestRssFeedItemWithUrl,
  createTestUser,
  insertTestCommunity,
  insertTestPost,
  insertTestRssFeed,
  insertTestTopic,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import { getListForWrite, searchListItems, searchUserLists } from '@services/lists'
import type { PrivateUser } from '@services/users/types'

describe('list mutation suspension guards', () => {
  const suspendedUserIds: string[] = []

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  async function suspendForTest(userId: string): Promise<void> {
    await suspendTestUser(userId)
    suspendedUserIds.push(userId)
  }

  async function createOwnedList(user: PrivateUser): Promise<string> {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name: `Guard List ${createRandomString(8)}` })
      .expect(201)
    return response.body.list.id as string
  }

  async function authenticateSuspended(user: PrivateUser) {
    await suspendForTest(user.id)
    const request = createRequest()
    await request.authenticateAs(user)
    return request
  }

  it('allows GET /api/v1/lists for a suspended owner', async () => {
    const user = await createTestUser()
    const listId = await createOwnedList(user)
    const request = await authenticateSuspended(user)
    const response = await request.get('/api/v1/lists').expect(200)
    expect(response.body.results.some((row: { id: string }) => row.id === listId)).toBe(true)
  })

  it('rejects POST /api/v1/lists from a suspended user without inserting a list', async () => {
    const user = await createTestUser()
    const request = await authenticateSuspended(user)
    const name = `Suspended Create ${createRandomString(8)}`
    const response = await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name })
    expect(response.status).toBe(403)
    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
    const { results } = await searchUserLists(user.id)
    expect(results.map(list => list.name)).not.toContain(name)
  })

  it('rejects PATCH /api/v1/lists/:id from a suspended owner without changing the list', async () => {
    const user = await createTestUser()
    const listId = await createOwnedList(user)
    const original = await getListForWrite(listId)
    const request = await authenticateSuspended(user)
    const response = await request
      .patch(`/api/v1/lists/${listId}`)
      .set('Content-Type', 'application/json')
      .send({ name: `Hijacked ${createRandomString(8)}` })
    expect(response.status).toBe(403)
    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
    expect((await getListForWrite(listId))?.name).toBe(original?.name)
  })

  it('rejects DELETE /api/v1/lists/:id from a suspended owner without removing the list', async () => {
    const user = await createTestUser()
    const listId = await createOwnedList(user)
    const request = await authenticateSuspended(user)
    const response = await request.delete(`/api/v1/lists/${listId}`)
    expect(response.status).toBe(403)
    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
    expect((await getListForWrite(listId))?.removed_at).toBeNull()
  })

  it('rejects POST /api/v1/lists/:id/items/posts from a suspended owner', async () => {
    const user = await createTestUser()
    const listId = await createOwnedList(user)
    const postId = await insertTestPost({
      title: `Guard Post ${createRandomString(8)}`,
      slug: `guard-post-${createRandomString(8)}`,
      createdById: user.id,
      markdown: 'content',
    })
    const request = await authenticateSuspended(user)
    const response = await request
      .post(`/api/v1/lists/${listId}/items/posts`)
      .set('Content-Type', 'application/json')
      .send({ post_id: postId })
    expect(response.status).toBe(403)
    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
    const { results } = await searchListItems(listId, {})
    expect(results).toEqual([])
  })

  it('rejects DELETE /api/v1/lists/:id/items/posts/:entityId from a suspended owner', async () => {
    const user = await createTestUser()
    const listId = await createOwnedList(user)
    const postId = await insertTestPost({
      title: `Guard Post Del ${createRandomString(8)}`,
      slug: `guard-post-del-${createRandomString(8)}`,
      createdById: user.id,
      markdown: 'content',
    })
    const setup = createRequest()
    await setup.authenticateAs(user)
    await setup
      .post(`/api/v1/lists/${listId}/items/posts`)
      .set('Content-Type', 'application/json')
      .send({ post_id: postId })
      .expect(201)
    const request = await authenticateSuspended(user)
    const response = await request.delete(`/api/v1/lists/${listId}/items/posts/${postId}`)
    expect(response.status).toBe(403)
    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
    const { results } = await searchListItems(listId, {})
    expect(results.map(item => item.entity_id)).toContain(postId)
  })

  it('rejects POST /api/v1/lists/:id/items/rss-feed-items from a suspended owner', async () => {
    const user = await createTestUser()
    const listId = await createOwnedList(user)
    const topicId = await insertTestTopic({
      name: `Guard RFI Topic ${createRandomString(8)}`,
      slug: `guard-rfi-topic-${createRandomString(8)}`,
      createdById: user.id,
    })
    const feedId = await insertTestRssFeed({
      topicId,
      title: `Guard RFI Feed ${createRandomString(8)}`,
    })
    const item = await createTestRssFeedItemWithUrl(feedId)
    const request = await authenticateSuspended(user)
    const response = await request
      .post(`/api/v1/lists/${listId}/items/rss-feed-items`)
      .set('Content-Type', 'application/json')
      .send({ rss_feed_item_id: item.id })
    expect(response.status).toBe(403)
    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
    const { results } = await searchListItems(listId, {})
    expect(results).toEqual([])
  })

  it('rejects DELETE /api/v1/lists/:id/items/rss-feed-items/:entityId from a suspended owner', async () => {
    const user = await createTestUser()
    const listId = await createOwnedList(user)
    const topicId = await insertTestTopic({
      name: `Guard RFI Del Topic ${createRandomString(8)}`,
      slug: `guard-rfi-del-topic-${createRandomString(8)}`,
      createdById: user.id,
    })
    const feedId = await insertTestRssFeed({
      topicId,
      title: `Guard RFI Del Feed ${createRandomString(8)}`,
    })
    const item = await createTestRssFeedItemWithUrl(feedId)
    const setup = createRequest()
    await setup.authenticateAs(user)
    await setup
      .post(`/api/v1/lists/${listId}/items/rss-feed-items`)
      .set('Content-Type', 'application/json')
      .send({ rss_feed_item_id: item.id })
      .expect(201)
    const request = await authenticateSuspended(user)
    const response = await request.delete(`/api/v1/lists/${listId}/items/rss-feed-items/${item.id}`)
    expect(response.status).toBe(403)
    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
    const { results } = await searchListItems(listId, {})
    expect(results.map(row => row.entity_id)).toContain(item.id)
  })

  it('rejects POST /api/v1/lists/:id/import from a suspended owner without importing', async () => {
    const user = await createTestUser()
    const listId = await createOwnedList(user)
    const community = await insertTestCommunity({ createdById: user.id })
    const request = await authenticateSuspended(user)
    const response = await request
      .post(`/api/v1/lists/${listId}/import`)
      .set('Content-Type', 'application/json')
      .send({ community_slug: community.slug })
    expect(response.status).toBe(403)
    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
    const { results } = await searchListItems(listId, {})
    expect(results).toEqual([])
  })
})
