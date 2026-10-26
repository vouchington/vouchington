import { describe, expect, it, onTestFinished } from 'vitest'
import { bookmarkEntity } from '@services/bookmarks/upsert'
import {
  createRandomString,
  createTestUser,
  insertTestPost,
  setEntityRelationCreatedAt,
  setPostModerationFlaggedForTest,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { reconcilePostContentNotificationVisibility } from './content-visibility-writes.mts'
import { listNotifications } from './list.mts'
import { reconcileNotificationsForPost } from './reconcile-post.mts'
import { notificationsWorkConfig } from './work-limits.mts'

describe('notification reconciliation batch visibility limit', () => {
  it('caps creation and system-pruned restoration batches when visibility limit is lowered', async () => {
    const author = await createTestUser()
    const postCreatedAt = new Date(Date.now() + 2_000)
    const subscribers = await Promise.all(Array.from({ length: 3 }, async () => createTestUser()))
    for (const subscriber of subscribers) {
      await bookmarkEntity(subscriber, 'user', { id: author.id }, 'subscribe')
      await setEntityRelationCreatedAt(
        'relation__user__subscribe__user',
        subscriber.id,
        author.id,
        new Date(postCreatedAt.getTime() - 1_000),
      )
    }
    const suffix = createRandomString(10)
    const postId = await insertTestPost({
      createdById: author.id,
      title: `Small visibility batch ${suffix}`,
      slug: `small-visibility-batch-${suffix}`,
      markdown: 'Small visibility batch test',
      createdAt: postCreatedAt,
    })
    onTestFinished(
      overrideDynamicConfigFieldsForTest(notificationsWorkConfig, {
        content_visibility_page_size: 1,
        reconcile_batch_size: 10,
      }),
    )
    const createdBatches: number[] = []
    await reconcileNotificationsForPost(postId, {
      batchSize: 10,
      onCreatedNotifications: batch => {
        createdBatches.push(batch.length)
      },
    })
    expect(createdBatches).toEqual([1, 1, 1])

    await setPostModerationFlaggedForTest({ postId, flagged: true })
    let cursor = (await reconcileNotificationsForPost(postId, { batchSize: 10 }))
      .nextVisibilityCursor
    for (let index = 0; index < subscribers.length && cursor; index += 1)
      cursor = (await reconcilePostContentNotificationVisibility(postId, cursor)).nextCursor
    await setPostModerationFlaggedForTest({ postId, flagged: false })
    await expect(reconcileNotificationsForPost(postId, { batchSize: 10 })).resolves.toMatchObject({
      created: 0,
    })
    for (const subscriber of subscribers)
      expect((await listNotifications(subscriber.id)).results).toHaveLength(1)
  })
})
