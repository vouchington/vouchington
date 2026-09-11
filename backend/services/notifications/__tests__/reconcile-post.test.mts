import { expect, it, describe } from 'vitest'

import { bookmarkEntity, unbookmarkEntity } from '@services/bookmarks/upsert'

import { listNotifications } from '../list.mts'

import { deleteNotification } from '../mutations.mts'

import { reconcileNotificationsForPost } from '../reconcile-post.mts'

import {
  createRandomString,
  createTestPost,
  createTestUser,
  followUser,
  insertTestPost,
  setEntityRelationCreatedAt,
  setEntityRelationDeletedAt,
} from '@voucha/test-helpers'

describe('reconcile-post', () => {
  function closedSubscriptionWindow() {
    const entityCreatedAt = new Date(Date.now() - 2_000)
    return {
      subscribedAt: new Date(entityCreatedAt.getTime() - 1_000),
      entityCreatedAt,
      unsubscribedAt: new Date(entityCreatedAt.getTime() + 1_000),
    }
  }

  function insertNotificationTestPost(authorId: string, title: string, createdAt?: Date) {
    const random = createRandomString(10)
    return insertTestPost({
      createdById: authorId,
      title: `${title} ${random}`,
      slug: `notification-test-post-${random}`,
      markdown: `Notification test post body ${random}`,
      createdAt,
    })
  }

  function insertNotificationTestComment(input: {
    authorId: string
    parentId: string
    rootId: string
    createdAt: Date
  }) {
    const random = createRandomString(10)
    return insertTestPost({
      createdById: input.authorId,
      title: '',
      slug: `notification-test-comment-${random}`,
      markdown: `Notification test comment body ${random}`,
      postType: 'comment',
      parentId: input.parentId,
      rootId: input.rootId,
      createdAt: input.createdAt,
    })
  }

  it('creates a notification for the auto-subscribed author when a direct reply is created', async () => {
    const author = await createTestUser()
    const replier = await createTestUser()
    if (!author || !replier) throw new Error('Failed to create users')

    const root = await createTestPost({ user: author, title: 'Root post' })
    // Establish the auto-subscribe precondition directly (the same real `bookmarkEntity` call
    // the entity-listener worker's `auto-subscribe-post-creator.mts` makes) instead of waiting
    // for the worker to process this post — this fixture's raw `createTestPost` never enqueues
    // `onPostCreated`, so the worker would never run and the wait would hang.
    await bookmarkEntity(author, 'post', { id: root.id }, 'subscribe')
    const reply = await createTestPost({
      user: replier,
      post_type: 'comment',
      parent_id: root.id,
      title: '',
      markdown: 'Reply body',
    })

    await reconcileNotificationsForPost(reply.id)

    const notifications = await listNotifications(author.id)
    expect(notifications.results).toHaveLength(1)
    expect(notifications.notifications[notifications.results[0]!.id]?.post_id).toBe(reply.id)
  })

  it('creates a notification when subscribing to a user and that user creates a post', async () => {
    const subscriber = await createTestUser()
    const author = await createTestUser()
    if (!subscriber || !author) throw new Error('Failed to create users')

    await bookmarkEntity(subscriber, 'user', { id: author.id }, 'subscribe')
    await setEntityRelationCreatedAt(
      'relation__user__subscribe__user',
      subscriber.id,
      author.id,
      new Date(Date.now() - 1_000),
    )

    const postId = await insertNotificationTestPost(author.id, 'Subscribed author post')
    await reconcileNotificationsForPost(postId)

    const notifications = await listNotifications(subscriber.id)
    expect(notifications.results).toHaveLength(1)
    expect(notifications.notifications[notifications.results[0]!.id]?.post_id).toBe(postId)
  })

  it('keeps old notifications after unsubscribing from a user', async () => {
    const subscriber = await createTestUser()
    const author = await createTestUser()
    if (!subscriber || !author) throw new Error('Failed to create users')
    const { subscribedAt, entityCreatedAt, unsubscribedAt } = closedSubscriptionWindow()

    await bookmarkEntity(subscriber, 'user', { id: author.id }, 'subscribe')
    await setEntityRelationCreatedAt(
      'relation__user__subscribe__user',
      subscriber.id,
      author.id,
      subscribedAt,
    )

    const postId = await insertNotificationTestPost(
      author.id,
      'Subscribed author post',
      entityCreatedAt,
    )
    await reconcileNotificationsForPost(postId)

    await unbookmarkEntity(subscriber, 'user', { id: author.id }, 'subscribe')
    await setEntityRelationDeletedAt(
      'relation__user__subscribe__user',
      subscriber.id,
      author.id,
      unsubscribedAt,
    )
    await expect(reconcileNotificationsForPost(postId)).resolves.toMatchObject({
      created: 0,
      pruned: 0,
    })

    const notifications = await listNotifications(subscriber.id)
    expect(notifications.results).toHaveLength(1)
    expect(notifications.notifications[notifications.results[0]!.id]?.post_id).toBe(postId)
  })

  it('creates a delayed notification for a post created before unsubscribing from a user', async () => {
    const subscriber = await createTestUser()
    const author = await createTestUser()
    if (!subscriber || !author) throw new Error('Failed to create users')
    const { subscribedAt, entityCreatedAt, unsubscribedAt } = closedSubscriptionWindow()

    await bookmarkEntity(subscriber, 'user', { id: author.id }, 'subscribe')
    await setEntityRelationCreatedAt(
      'relation__user__subscribe__user',
      subscriber.id,
      author.id,
      subscribedAt,
    )

    const postId = await insertNotificationTestPost(
      author.id,
      'Delayed subscribed author post',
      entityCreatedAt,
    )

    await unbookmarkEntity(subscriber, 'user', { id: author.id }, 'subscribe')
    await setEntityRelationDeletedAt(
      'relation__user__subscribe__user',
      subscriber.id,
      author.id,
      unsubscribedAt,
    )
    await expect(reconcileNotificationsForPost(postId)).resolves.toMatchObject({
      created: 1,
      pruned: 0,
    })
    await expect(reconcileNotificationsForPost(postId)).resolves.toMatchObject({
      created: 0,
      pruned: 0,
    })

    const notifications = await listNotifications(subscriber.id)
    expect(notifications.results).toHaveLength(1)
    expect(notifications.notifications[notifications.results[0]!.id]?.post_id).toBe(postId)
  })

  it('creates a delayed notification for a reply created before unsubscribing from a post', async () => {
    const subscriber = await createTestUser()
    const rootAuthor = await createTestUser()
    const replier = await createTestUser()
    if (!subscriber || !rootAuthor || !replier) throw new Error('Failed to create users')
    const { subscribedAt, entityCreatedAt, unsubscribedAt } = closedSubscriptionWindow()
    const rootCreatedAt = new Date(subscribedAt.getTime() - 1_000)

    const rootId = await insertNotificationTestPost(
      rootAuthor.id,
      'Subscribed parent post',
      rootCreatedAt,
    )
    await bookmarkEntity(subscriber, 'post', { id: rootId }, 'subscribe')
    await setEntityRelationCreatedAt(
      'relation__user__subscribe__post',
      subscriber.id,
      rootId,
      subscribedAt,
    )

    const replyId = await insertNotificationTestComment({
      authorId: replier.id,
      parentId: rootId,
      rootId,
      createdAt: entityCreatedAt,
    })

    await unbookmarkEntity(subscriber, 'post', { id: rootId }, 'subscribe')
    await setEntityRelationDeletedAt(
      'relation__user__subscribe__post',
      subscriber.id,
      rootId,
      unsubscribedAt,
    )
    await expect(reconcileNotificationsForPost(replyId)).resolves.toMatchObject({
      created: 1,
      pruned: 0,
    })

    const notifications = await listNotifications(subscriber.id)
    expect(notifications.results).toHaveLength(1)
    expect(notifications.notifications[notifications.results[0]!.id]?.post_id).toBe(replyId)
  })

  it('applies a restricted root audience when reconciling comment subscribers', async () => {
    const subscriber = await createTestUser()
    const rootAuthor = await createTestUser()
    const replier = await createTestUser()
    const rootId = await insertTestPost({
      broadcast: 'followers',
      createdById: rootAuthor.id,
      markdown: 'Restricted root body',
      privacy: 'private',
      slug: `restricted-root-${createRandomString(8)}`,
      title: 'Restricted root',
    })
    for (const recipient of [subscriber, rootAuthor]) {
      await bookmarkEntity(recipient, 'post', { id: rootId }, 'subscribe')
      await setEntityRelationCreatedAt(
        'relation__user__subscribe__post',
        recipient.id,
        rootId,
        new Date(Date.now() - 1_000),
      )
    }
    const replyId = await insertNotificationTestComment({
      authorId: replier.id,
      createdAt: new Date(),
      parentId: rootId,
      rootId,
    })

    await expect(reconcileNotificationsForPost(replyId)).resolves.toMatchObject({ created: 1 })
    expect((await listNotifications(rootAuthor.id)).results).toHaveLength(1)
    expect((await listNotifications(subscriber.id)).results).toHaveLength(0)
    await followUser(subscriber, rootAuthor)
    await expect(reconcileNotificationsForPost(replyId)).resolves.toMatchObject({ created: 1 })
    expect((await listNotifications(subscriber.id)).results).toHaveLength(1)
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof deleteNotification)
})
