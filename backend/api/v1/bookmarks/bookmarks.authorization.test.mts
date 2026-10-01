import { afterEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestRssFeedItemWithUrl,
  createTestUser,
  insertTestCommunity,
  insertTestPost,
  insertTestRssFeed,
  insertTestTopic,
  insertTestUrl,
  insertTestUrlHostname,
  softDeleteRssFeedItemsForTest,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import type { PrivateUser } from '@services/users/types'

describe('bookmark mutation authorization', () => {
  const suspendedUserIds: string[] = []

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  it.each([
    'post',
    'topic',
    'user',
    'rss_feed',
    'rss_feed_item',
    'url',
    'url_hostname',
    'community',
  ] as const)('allows bookmarking a visible %s', async entityType => {
    const user = await createTestUser()
    const target = await createVisibleTarget(entityType, user)
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .put(`/api/v1/bookmarks/${target.entityType}/${target.entityId}/${target.predicate}`)
      .expect(200)

    expect(response.body.bookmark).toBeDefined()
    const bookmarks = await request
      .get(`/api/v1/bookmarks/${target.entityType}/${target.entityId}`)
      .expect(200)
    expect(bookmarks.body.bookmarks[target.predicate]).toBe(true)
  })

  it('hides another user’s private post as if it did not exist', async () => {
    expect.hasAssertions()
    const viewer = await createTestUser()
    const owner = await createTestUser()
    const postId = await insertTestPost({
      title: `Private bookmark ${crypto.randomUUID()}`,
      slug: `private-bookmark-${crypto.randomUUID()}`,
      createdById: owner.id,
      markdown: 'private post',
      privacy: 'private',
    })

    await expectHiddenTarget(viewer, 'post', postId, 'save')
  })

  it('hides a rejected reply when its root post is visible', async () => {
    expect.hasAssertions()
    const viewer = await createTestUser()
    const rootId = await insertTestPost({
      title: `Visible bookmark root ${crypto.randomUUID()}`,
      slug: `visible-bookmark-root-${crypto.randomUUID()}`,
      createdById: viewer.id,
      markdown: 'visible root',
    })
    const replyAuthor = await createTestUser()
    const replyId = await insertTestPost({
      title: `Rejected bookmark reply ${crypto.randomUUID()}`,
      slug: `rejected-bookmark-reply-${crypto.randomUUID()}`,
      createdById: replyAuthor.id,
      markdown: 'rejected reply',
      postType: 'comment',
      rootId,
      parentId: rootId,
      clearanceStatus: 'rejected',
    })

    const request = createRequest()
    await request.authenticateAs(viewer)
    await request.get(`/api/v1/posts/${replyId}`).expect(404)

    await expectHiddenTarget(viewer, 'post', replyId, 'save')
  })

  it('allows bookmarking the caller’s own private post', async () => {
    const user = await createTestUser()
    const postId = await insertTestPost({
      title: `Own private bookmark ${crypto.randomUUID()}`,
      slug: `own-private-bookmark-${crypto.randomUUID()}`,
      createdById: user.id,
      markdown: 'private post',
      privacy: 'private',
    })
    const request = createRequest()
    await request.authenticateAs(user)

    await request.put(`/api/v1/bookmarks/post/${postId}/save`).expect(200)
  })

  it('hides a private community from a non-member', async () => {
    expect.hasAssertions()
    const viewer = await createTestUser()
    const owner = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      visibility: 'private',
    })

    await expectHiddenTarget(viewer, 'community', community.id, 'save')
  })

  it('hides a removed RSS feed item as if it did not exist', async () => {
    expect.hasAssertions()
    const viewer = await createTestUser()
    const owner = await createTestUser()
    const itemId = await createFeedItem(owner)
    await softDeleteRssFeedItemsForTest([itemId])

    await expectHiddenTarget(viewer, 'rss_feed_item', itemId, 'save')
  })

  it('hides blocked URLs and hostnames from non-moderators', async () => {
    expect.hasAssertions()
    const viewer = await createTestUser()
    const hostname = `bookmark-${crypto.randomUUID().replaceAll('-', '')}.example`
    const hostnameId = await insertTestUrlHostname({ hostname, blocked: true })
    const urlId = await insertTestUrl({ url: `https://${hostname}/hidden`, hostnameId })

    await expectHiddenTarget(viewer, 'url', urlId, 'save')
    await expectHiddenTarget(viewer, 'url_hostname', hostnameId, 'mute')
  })

  it('refuses suspended PUT without creating a bookmark', async () => {
    const user = await createTestUser()
    const topicId = await createTopic(user)
    const request = await authenticateSuspended(user, suspendedUserIds)

    const response = await request.put(`/api/v1/bookmarks/topic/${topicId}/follow`)
    expect(response.status).toBe(403)
    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
    const bookmarks = await request.get(`/api/v1/bookmarks/topic/${topicId}`).expect(200)
    expect(bookmarks.body.bookmarks).toEqual({})
  })

  it('refuses suspended DELETE and preserves the existing bookmark', async () => {
    const user = await createTestUser()
    const topicId = await createTopic(user)
    const request = createRequest()
    await request.authenticateAs(user)
    await request.put(`/api/v1/bookmarks/topic/${topicId}/follow`).expect(200)
    await suspendTestUser(user.id)
    suspendedUserIds.push(user.id)

    const response = await request.delete(`/api/v1/bookmarks/topic/${topicId}/follow`)
    expect(response.status).toBe(403)
    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
    const bookmarks = await request.get(`/api/v1/bookmarks/topic/${topicId}`).expect(200)
    expect(bookmarks.body.bookmarks.follow).toBe(true)
  })

  it('allows DELETE after an RSS feed item becomes hidden', async () => {
    const user = await createTestUser()
    const itemId = await createFeedItem(user)
    const request = createRequest()
    await request.authenticateAs(user)
    await request.put(`/api/v1/bookmarks/rss_feed_item/${itemId}/save`).expect(200)
    await softDeleteRssFeedItemsForTest([itemId])

    await request.delete(`/api/v1/bookmarks/rss_feed_item/${itemId}/save`).expect(204)
  })
})

async function createVisibleTarget(
  entityType:
    | 'post'
    | 'topic'
    | 'user'
    | 'rss_feed'
    | 'rss_feed_item'
    | 'url'
    | 'url_hostname'
    | 'community',
  user: PrivateUser,
): Promise<{ entityType: string; entityId: string; predicate: string }> {
  switch (entityType) {
    case 'post':
      return {
        entityType,
        entityId: await insertTestPost({
          title: `Bookmark target ${crypto.randomUUID()}`,
          slug: `bookmark-target-${crypto.randomUUID()}`,
          createdById: user.id,
          markdown: 'visible post',
        }),
        predicate: 'save',
      }
    case 'topic':
      return { entityType, entityId: await createTopic(user), predicate: 'follow' }
    case 'user':
      return { entityType, entityId: (await createTestUser()).id, predicate: 'mute' }
    case 'rss_feed': {
      const topicId = await createTopic(user)
      return {
        entityType,
        entityId: await insertTestRssFeed({
          topicId,
          title: `Bookmark feed ${crypto.randomUUID()}`,
        }),
        predicate: 'follow',
      }
    }
    case 'rss_feed_item':
      return { entityType, entityId: await createFeedItem(user), predicate: 'save' }
    case 'url':
    case 'url_hostname': {
      const hostname = `bookmark-${crypto.randomUUID().replaceAll('-', '')}.example`
      const hostnameId = await insertTestUrlHostname({ hostname })
      return entityType === 'url'
        ? {
            entityType,
            entityId: await insertTestUrl({ url: `https://${hostname}/visible`, hostnameId }),
            predicate: 'save',
          }
        : { entityType, entityId: hostnameId, predicate: 'mute' }
    }
    case 'community': {
      const community = await insertTestCommunity({ createdById: user.id })
      return { entityType, entityId: community.id, predicate: 'save' }
    }
  }
}

async function createFeedItem(user: PrivateUser): Promise<string> {
  const topicId = await createTopic(user)
  const feedId = await insertTestRssFeed({ topicId, title: `Bookmark feed ${crypto.randomUUID()}` })
  return (await createTestRssFeedItemWithUrl(feedId)).id
}

async function createTopic(user: PrivateUser): Promise<string> {
  return insertTestTopic({
    name: `Bookmark topic ${crypto.randomUUID()}`,
    slug: `bookmark-topic-${crypto.randomUUID()}`,
    createdById: user.id,
  })
}

async function expectHiddenTarget(
  viewer: PrivateUser,
  entityType: string,
  entityId: string,
  predicate: string,
): Promise<void> {
  const request = createRequest()
  await request.authenticateAs(viewer)

  const response = await request.put(`/api/v1/bookmarks/${entityType}/${entityId}/${predicate}`)
  expect(response.status).toBe(404)
  expect(response.body.message).toBe('Entity not found')

  const bookmarks = await request.get(`/api/v1/bookmarks/${entityType}/${entityId}`).expect(200)
  expect(bookmarks.body.bookmarks).toEqual({})
}

async function authenticateSuspended(
  user: PrivateUser,
  suspendedUserIds: string[],
): Promise<ReturnType<typeof createRequest>> {
  await suspendTestUser(user.id)
  suspendedUserIds.push(user.id)
  const request = createRequest()
  await request.authenticateAs(user)
  return request
}
