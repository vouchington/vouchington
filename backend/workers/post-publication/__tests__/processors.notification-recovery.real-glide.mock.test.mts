import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createQueue, closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import {
  beginTransaction,
  createTestUser,
  insertTestPost,
  getTestPostPublicationDirtyWorkForScope,
  hasTestPostPublicationProjectionReceipt,
} from '@voucha/test-helpers'
import { recordPostPublicationChange } from '@services/post-publication'
import { processReconcilePostPublication } from '../processors.mts'

// The real-transport project routes by this suffix; no queue or service is mocked.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async original => original())

describe('post-publication notification recovery (real GlideMQ)', () => {
  it('does not acknowledge publication work when its notification enqueue fails, then retries delivery', async () => {
    const user = await createTestUser()
    const postId = await insertTestPost({
      createdById: user.id,
      title: 'Notification recovery',
      slug: `notification-recovery-${randomUUID()}`,
      markdown: 'Notification recovery fixture.',
    })
    await using transaction = await beginTransaction()
    await recordPostPublicationChange(transaction, {
      scope: { type: 'post', postId },
      reason: 'post_topics_changed',
    })
    await transaction.commit()
    const captured = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: postId })
    if (!captured) throw new Error('Expected publication dirty work')
    const unavailable = createQueue(`unavailable-notifications-${randomUUID()}`)
    await closeAndUnregisterGlideMQInstance(unavailable)
    let notificationAttempts = 0
    await expect(
      processReconcilePostPublication(
        {},
        {
          listAvailablePostPublicationDirtyWork: async () => [captured],
          enqueueBulkReconcilePostNotifications: async ids => {
            notificationAttempts++
            await unavailable.addBulk(ids.map(id => ({ name: 'reconcile-post', data: { id } })))
          },
        },
      ),
    ).rejects.toThrow(/Queue is closing/)
    expect(notificationAttempts).toBe(1)
    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'post', id: postId }),
    ).resolves.toBeDefined()
    await expect(hasTestPostPublicationProjectionReceipt(postId)).resolves.toBe(false)

    const recovered = createQueue<{ id: string }>(`recovered-notifications-${randomUUID()}`)
    try {
      await expect(
        processReconcilePostPublication(
          {},
          {
            listAvailablePostPublicationDirtyWork: async () => [captured],
            enqueueBulkReconcilePostNotifications: async ids => {
              await recovered.addBulk(ids.map(id => ({ name: 'reconcile-post', data: { id } })))
            },
          },
        ),
      ).resolves.toEqual({ reconciled: 1 })
      expect((await recovered.getJobs('waiting')).map(job => job.data.id)).toContain(postId)
      await expect(
        getTestPostPublicationDirtyWorkForScope({ type: 'post', id: postId }),
      ).resolves.toBeUndefined()
      await expect(hasTestPostPublicationProjectionReceipt(postId)).resolves.toBe(true)
    } finally {
      for (const job of await recovered.getJobs('waiting')) await job.remove()
      await closeAndUnregisterGlideMQInstance(recovered)
    }
  })
})
