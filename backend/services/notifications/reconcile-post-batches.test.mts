import { expect, it, describe } from 'vitest'
import { bookmarkEntity, unbookmarkEntity } from '@services/bookmarks/upsert'
import { listNotifications } from './list.mts'
import { markNotificationRead } from './mutations.mts'
import { reconcileNotificationsForPost } from './reconcile-post.mts'
import {
  createRandomString,
  createTestUser,
  followUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPost,
  setEntityRelationCreatedAt,
  setEntityRelationDeletedAt,
  setPostModerationFlaggedForTest,
} from '@voucha/test-helpers'

describe('reconcile-post batches', () => {
  function insertNotificationTestPost(authorId: string, title: string, createdAt?: Date) {
    const random = createRandomString(10)
    return insertTestPost({
      createdById: authorId,
      title: `${title} ${random}`,
      slug: `notification-batch-test-post-${random}`,
      markdown: `Notification batch test post body ${random}`,
      createdAt,
    })
  }

  async function createUserSubscribers(authorId: string, count: number, createdAt: Date) {
    const subscribers = await Promise.all(
      Array.from({ length: count }, async () => await createTestUser()),
    )
    await Promise.all(
      subscribers.map(async subscriber => {
        await bookmarkEntity(subscriber, 'user', { id: authorId }, 'subscribe')
        await setEntityRelationCreatedAt(
          'relation__user__subscribe__user',
          subscriber.id,
          authorId,
          createdAt,
        )
      }),
    )
    return subscribers
  }

  it('creates post notifications in bounded recipient batches', async () => {
    const author = await createTestUser()
    if (!author) throw new Error('Failed to create user')
    const postCreatedAt = new Date(Date.now() + 2_000)
    const subscribers = await createUserSubscribers(
      author.id,
      5,
      new Date(postCreatedAt.getTime() - 1_000),
    )
    const postId = await insertNotificationTestPost(
      author.id,
      'Batched subscribed author post',
      postCreatedAt,
    )
    const pushedBatches: number[] = []
    const firstBatchStarted = Promise.withResolvers<void>()
    const releaseFirstBatch = Promise.withResolvers<void>()

    const resultPromise = reconcileNotificationsForPost(postId, {
      batchSize: 2,
      onCreatedNotifications: async batch => {
        pushedBatches.push(batch.length)
        if (pushedBatches.length === 1) {
          firstBatchStarted.resolve()
          await releaseFirstBatch.promise
        }
      },
    })

    await firstBatchStarted.promise
    expect(pushedBatches).toEqual([2])
    releaseFirstBatch.resolve()
    const result = await resultPromise

    expect(result).toMatchObject({ created: 5, pruned: 0 })
    expect('createdNotifications' in result).toBe(false)
    expect(pushedBatches).toEqual([2, 2, 1])
    await expect(reconcileNotificationsForPost(postId, { batchSize: 2 })).resolves.toMatchObject({
      created: 0,
      pruned: 0,
    })
    await Promise.all(
      subscribers.map(async subscriber => {
        const notifications = await listNotifications(subscriber.id)
        expect(notifications.results).toHaveLength(1)
      }),
    )
  })

  it('prunes only unread post notifications outside the bounded recipient table', async () => {
    const author = await createTestUser()
    if (!author) throw new Error('Failed to create user')
    const postCreatedAt = new Date(Date.now() + 2_000)
    const [activeSubscriber, staleUnreadSubscriber, staleReadSubscriber] =
      await createUserSubscribers(author.id, 3, new Date(postCreatedAt.getTime() - 1_000))
    const postId = await insertNotificationTestPost(
      author.id,
      'Pruned subscribed author post',
      postCreatedAt,
    )

    await reconcileNotificationsForPost(postId, { batchSize: 2 })
    const staleReadNotifications = await listNotifications(staleReadSubscriber!.id)
    await markNotificationRead(staleReadSubscriber!.id, staleReadNotifications.results[0]!.id)

    await unbookmarkEntity(staleUnreadSubscriber!, 'user', { id: author.id }, 'subscribe')
    await unbookmarkEntity(staleReadSubscriber!, 'user', { id: author.id }, 'subscribe')
    const deletedAtBeforePost = new Date(postCreatedAt.getTime() - 500)
    await setEntityRelationDeletedAt(
      'relation__user__subscribe__user',
      staleUnreadSubscriber!.id,
      author.id,
      deletedAtBeforePost,
    )
    await setEntityRelationDeletedAt(
      'relation__user__subscribe__user',
      staleReadSubscriber!.id,
      author.id,
      deletedAtBeforePost,
    )

    await expect(reconcileNotificationsForPost(postId, { batchSize: 2 })).resolves.toMatchObject({
      created: 0,
      pruned: 1,
    })

    expect((await listNotifications(activeSubscriber!.id)).results).toHaveLength(1)
    expect((await listNotifications(staleUnreadSubscriber!.id)).results).toHaveLength(0)
    expect((await listNotifications(staleReadSubscriber!.id)).results).toHaveLength(1)
  })

  it('restores system-pruned post notifications without re-pushing them', async () => {
    const author = await createTestUser()
    if (!author) throw new Error('Failed to create user')
    const postCreatedAt = new Date(Date.now() + 2_000)
    const [subscriber] = await createUserSubscribers(
      author.id,
      1,
      new Date(postCreatedAt.getTime() - 1_000),
    )
    const postId = await insertNotificationTestPost(
      author.id,
      'Restored subscribed author post',
      postCreatedAt,
    )

    await reconcileNotificationsForPost(postId, { batchSize: 1 })
    await setPostModerationFlaggedForTest({ postId, flagged: true })
    await expect(reconcileNotificationsForPost(postId, { batchSize: 1 })).resolves.toMatchObject({
      created: 0,
      pruned: 1,
    })
    expect((await listNotifications(subscriber!.id)).results).toHaveLength(0)

    await setPostModerationFlaggedForTest({ postId, flagged: false })
    const pushedBatches: number[] = []

    await expect(
      reconcileNotificationsForPost(postId, {
        batchSize: 1,
        onCreatedNotifications: batch => {
          pushedBatches.push(batch.length)
        },
      }),
    ).resolves.toMatchObject({ created: 0, pruned: 0 })

    expect(pushedBatches).toEqual([])
    expect((await listNotifications(subscriber!.id)).results).toHaveLength(1)
  })

  it('notifies a user subscriber for registered-only private content', async () => {
    const author = await createTestUser()
    const subscriber = await createTestUser()
    await bookmarkEntity(subscriber, 'user', { id: author.id }, 'subscribe')
    await setEntityRelationCreatedAt(
      'relation__user__subscribe__user',
      subscriber.id,
      author.id,
      new Date(Date.now() - 1_000),
    )
    const postId = await insertTestPost({
      broadcast: 'users',
      createdById: author.id,
      markdown: 'Registered notification body',
      privacy: 'private',
      slug: `registered-notification-${createRandomString(8)}`,
      title: 'Registered notification',
    })

    await expect(reconcileNotificationsForPost(postId)).resolves.toMatchObject({ created: 1 })
    expect((await listNotifications(subscriber.id)).results).toHaveLength(1)
  })

  it('notifies only an authorized follower for followers-only private content', async () => {
    const author = await createTestUser()
    const follower = await createTestUser()
    const nonFollower = await createTestUser()
    const subscribedAt = new Date(Date.now() - 1_000)
    for (const subscriber of [follower, nonFollower]) {
      await bookmarkEntity(subscriber, 'user', { id: author.id }, 'subscribe')
      await setEntityRelationCreatedAt(
        'relation__user__subscribe__user',
        subscriber.id,
        author.id,
        subscribedAt,
      )
    }
    await followUser(follower, author)
    const postId = await insertTestPost({
      broadcast: 'followers',
      createdById: author.id,
      markdown: 'Followers notification body',
      privacy: 'private',
      slug: `followers-notification-${createRandomString(8)}`,
      title: 'Followers notification',
    })

    await expect(reconcileNotificationsForPost(postId)).resolves.toMatchObject({ created: 1 })
    expect((await listNotifications(follower.id)).results).toHaveLength(1)
    expect((await listNotifications(nonFollower.id)).results).toHaveLength(0)
  })

  it('notifies only an active member for a private-community post', async () => {
    const author = await createTestUser()
    const member = await createTestUser()
    const nonMember = await createTestUser()
    const community = await insertTestCommunity({
      createdById: author.id,
      visibility: 'private',
    })
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })
    const subscribedAt = new Date(Date.now() - 1_000)
    for (const subscriber of [member, nonMember]) {
      await bookmarkEntity(subscriber, 'user', { id: author.id }, 'subscribe')
      await setEntityRelationCreatedAt(
        'relation__user__subscribe__user',
        subscriber.id,
        author.id,
        subscribedAt,
      )
    }
    const postId = await insertTestPost({
      communityId: community.id,
      createdById: author.id,
      markdown: 'Private community notification body',
      slug: `private-community-notification-${createRandomString(8)}`,
      title: 'Private community notification',
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: author.id,
    })

    await expect(reconcileNotificationsForPost(postId)).resolves.toMatchObject({ created: 1 })
    expect((await listNotifications(member.id)).results).toHaveLength(1)
    expect((await listNotifications(nonMember.id)).results).toHaveLength(0)
  })
})
