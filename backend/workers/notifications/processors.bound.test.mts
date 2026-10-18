import { describe, expect, it } from 'vitest'
import { bookmarkEntity } from '../../services/bookmarks/upsert.mts'
import { listNotifications } from '@services/notifications/list'
import {
  createRandomString,
  createTestUser,
  insertTestPost,
  setEntityRelationCreatedAt,
} from '@voucha/test-helpers'
import { processReconcilePostNotifications } from './processors.mts'

describe('notification reconcile recipient pages', () => {
  it('returns a unique recipient cursor and persists each page idempotently', async () => {
    const author = await createTestUser()
    const recipients = await Promise.all([createTestUser(), createTestUser()])
    const createdAt = new Date('2040-01-01T00:00:00Z')
    await Promise.all(
      recipients.map(async user => {
        await bookmarkEntity(user, 'user', { id: author.id }, 'subscribe')
        await setEntityRelationCreatedAt(
          'relation__user__subscribe__user',
          user.id,
          author.id,
          new Date(createdAt.getTime() - 1000),
        )
      }),
    )
    const suffix = createRandomString(10)
    const postId = await insertTestPost({
      createdById: author.id,
      title: `page ${suffix}`,
      slug: `page-${suffix}`,
      markdown: 'Recipient page boundary',
      createdAt,
    })
    const first = await processReconcilePostNotifications({ postId, pageSize: 1 })
    expect(first.nextAfterUserId).toBe(recipients.map(user => user.id).toSorted()[0])
    const repeated = await processReconcilePostNotifications({ postId, pageSize: 1 })
    expect(repeated).toMatchObject({ created: 0, nextAfterUserId: first.nextAfterUserId })
    const second = await processReconcilePostNotifications({
      postId,
      pageSize: 1,
      afterUserId: first.nextAfterUserId,
    })
    expect(second.nextAfterUserId).toBe(recipients.map(user => user.id).toSorted()[1])
    const final = await processReconcilePostNotifications({
      postId,
      pageSize: 1,
      afterUserId: second.nextAfterUserId,
    })
    expect(final.nextAfterUserId).toBeUndefined()
    const ids = await Promise.all(
      recipients.map(async user => (await listNotifications(user.id)).results.map(row => row.id)),
    )
    expect(ids.map(rows => rows.length)).toEqual([1, 1])
  })
})
