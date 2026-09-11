import { expect, it, describe } from 'vitest'

import { bookmarkEntity, unbookmarkEntity } from '@services/bookmarks/upsert'

import { listNotifications } from '../list.mts'

import { deleteNotification } from '../mutations.mts'

import { reconcileNotificationsForPost } from '../reconcile-post.mts'
import {
  createRandomString,
  createTestPost,
  createTestTopic,
  createTestUser,
  createTopHashtagAliasForTest,
  createTopHashtagPostSourceForTest,
  insertScoredPostTopicCategoryRelation,
  insertTestPost,
  setScoredPostTopicCategoryRelationScore,
  setEntityRelationCreatedAt,
  setEntityRelationDeletedAt,
  softDeleteTopic,
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

  it('does not notify user subscribers for posts created after unsubscribing', async () => {
    const subscriber = await createTestUser()
    const author = await createTestUser()
    if (!subscriber || !author) throw new Error('Failed to create users')

    await bookmarkEntity(subscriber, 'user', { id: author.id }, 'subscribe')
    await setEntityRelationCreatedAt(
      'relation__user__subscribe__user',
      subscriber.id,
      author.id,
      new Date(Date.now() - 2_000),
    )
    await unbookmarkEntity(subscriber, 'user', { id: author.id }, 'subscribe')
    await setEntityRelationDeletedAt(
      'relation__user__subscribe__user',
      subscriber.id,
      author.id,
      new Date(Date.now() - 1_000),
    )

    const postId = await insertNotificationTestPost(author.id, 'Post after user unsubscribe')
    await reconcileNotificationsForPost(postId)

    const notifications = await listNotifications(subscriber.id)
    expect(notifications.results).toHaveLength(0)
  })

  it('does not notify user subscribers when author posts anonymously', async () => {
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

    const random = createRandomString(10)
    const postId = await insertTestPost({
      createdById: author.id,
      title: `Anonymous post ${random}`,
      slug: `anonymous-notification-test-post-${random}`,
      markdown: `Anonymous notification test body ${random}`,
      isAnonymous: true,
    })
    await reconcileNotificationsForPost(postId)

    const notifications = await listNotifications(subscriber.id)
    expect(notifications.results).toHaveLength(0)
  })

  it('anonymous reply notification hides the author username', async () => {
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
      markdown: 'Anonymous reply body',
      is_anonymous: true,
    })

    await reconcileNotificationsForPost(reply.id)

    const notifications = await listNotifications(author.id)
    expect(notifications.results).toHaveLength(1)
    const notification = notifications.notifications[notifications.results[0]!.id]!
    expect(notification.title).toBe('New reply')
    expect(notification.title).not.toContain(replier.username)
    expect(notification.actor_label).toBeNull()
  })

  it('does not recreate a notification after the user deletes it', async () => {
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

    const initialNotifications = await listNotifications(author.id)
    const notificationId = initialNotifications.results[0]?.id
    expect(notificationId).toBeTruthy()

    await deleteNotification(author.id, notificationId!)
    await reconcileNotificationsForPost(reply.id)

    const notifications = await listNotifications(author.id)
    expect(notifications.results).toHaveLength(0)
  })

  it('prunes topic-subscription notifications when a direct post topic loses support', async () => {
    const subscriber = await createTestUser()
    const author = await createTestUser()
    const topic = await createTestTopic({ user: author })

    await bookmarkEntity(subscriber, 'topic', topic, 'subscribe_posts')
    const post = await createTestPost({ user: author, title: 'Scored direct topic post' })
    await insertScoredPostTopicCategoryRelation(post.id, topic.id, author.id)

    await expect(reconcileNotificationsForPost(post.id)).resolves.toMatchObject({
      created: 1,
      pruned: 0,
    })
    expect((await listNotifications(subscriber.id)).results).toHaveLength(1)

    await setScoredPostTopicCategoryRelationScore(post.id, topic.id, 0)

    await expect(reconcileNotificationsForPost(post.id)).resolves.toMatchObject({
      created: 0,
      pruned: 1,
    })
    expect((await listNotifications(subscriber.id)).results).toHaveLength(0)
  })

  it('prunes topic-subscription notifications when a linked hashtag owner is deleted', async () => {
    const subscriber = await createTestUser()
    const author = await createTestUser()
    const topic = await createTestTopic({ user: author })
    const hashtag = `subscribed-${createRandomString(8).toLowerCase()}`
    const aliasId = await createTopHashtagAliasForTest(topic.id, hashtag)
    await bookmarkEntity(subscriber, 'topic', topic, 'subscribe_posts')
    const post = await createTestPost({ user: author, title: `Linked #${hashtag}` })
    await createTopHashtagPostSourceForTest({
      postId: post.id,
      topicAliasId: aliasId,
      userId: author.id,
      authoredToken: `#${hashtag}`,
    })

    await expect(reconcileNotificationsForPost(post.id)).resolves.toMatchObject({
      created: 1,
      pruned: 0,
    })
    expect((await listNotifications(subscriber.id)).results).toHaveLength(1)

    await softDeleteTopic(topic.id, author.id)

    await expect(reconcileNotificationsForPost(post.id)).resolves.toMatchObject({
      created: 0,
      pruned: 1,
    })
    expect((await listNotifications(subscriber.id)).results).toHaveLength(0)
  })

  it('does not notify topic subscribers for a pending-clearance linked hashtag post', async () => {
    const subscriber = await createTestUser()
    const author = await createTestUser()
    const topic = await createTestTopic({ user: author })
    const hashtag = `pending-${createRandomString(8).toLowerCase()}`
    const aliasId = await createTopHashtagAliasForTest(topic.id, hashtag)
    await bookmarkEntity(subscriber, 'topic', topic, 'subscribe_posts')
    const postId = await insertTestPost({
      createdById: author.id,
      title: `Pending #${hashtag}`,
      slug: `pending-${createRandomString(8)}`,
      markdown: `#${hashtag}`,
      clearanceStatus: 'pending',
    })
    await createTopHashtagPostSourceForTest({
      postId,
      topicAliasId: aliasId,
      userId: author.id,
      authoredToken: `#${hashtag}`,
    })

    await expect(reconcileNotificationsForPost(postId)).resolves.toMatchObject({ created: 0 })
    expect((await listNotifications(subscriber.id)).results).toHaveLength(0)
  })

  it('does not notify an unrelated topic subscriber for a public followers-only hashtag post', async () => {
    const subscriber = await createTestUser()
    const author = await createTestUser()
    const topic = await createTestTopic({ user: author })
    const hashtag = `followers-${createRandomString(8).toLowerCase()}`
    const aliasId = await createTopHashtagAliasForTest(topic.id, hashtag)
    await bookmarkEntity(subscriber, 'topic', topic, 'subscribe_posts')
    const postId = await insertTestPost({
      broadcast: 'followers',
      createdById: author.id,
      markdown: `#${hashtag}`,
      slug: `followers-${createRandomString(8)}`,
      title: `Followers #${hashtag}`,
    })
    await createTopHashtagPostSourceForTest({
      authoredToken: `#${hashtag}`,
      postId,
      topicAliasId: aliasId,
      userId: author.id,
    })

    await expect(reconcileNotificationsForPost(postId)).resolves.toMatchObject({ created: 0 })
    expect((await listNotifications(subscriber.id)).results).toHaveLength(0)
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof closedSubscriptionWindow)
  void (0 as unknown as typeof insertNotificationTestComment)
})
