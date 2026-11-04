import { describe, expect, it, vi } from 'vitest'
import { memberships } from '@queues/memberships/queues'
import { createTestAppleRecoveryNotification } from '@voucha/test-helpers/apple-recovery-fixtures'
import { recoverAppleNotifications } from './apple-notification-recovery.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('Apple notification recovery with real GlideMQ', () => {
  it('restores owned lost stable jobs and keeps concurrent recovery deduplicated', async () => {
    const neighbor = await createTestAppleRecoveryNotification()
    const owned = await createTestAppleRecoveryNotification()

    try {
      await expect(memberships.getJob(owned.jobId)).resolves.toBeNull()
      await expect(recoverAppleNotifications([owned.evidenceId], 1)).resolves.toEqual({
        enqueued: 1,
        hasMore: true,
      })
      await expect(recoverAppleNotifications([owned.evidenceId], 2)).resolves.toEqual({
        enqueued: 1,
        hasMore: false,
      })
      await expect(
        Promise.all([
          recoverAppleNotifications([owned.evidenceId], 1),
          recoverAppleNotifications([owned.evidenceId], 1),
        ]),
      ).resolves.toEqual([
        { enqueued: 1, hasMore: true },
        { enqueued: 1, hasMore: true },
      ])

      await expect(memberships.getJob(owned.jobId)).resolves.toMatchObject({
        id: owned.jobId,
        name: 'processAppleNotification',
        data: {
          evidenceId: owned.evidenceId,
          providerLineageId: 'original-transaction-id',
          environment: 'test',
        },
        opts: { deduplication: { id: owned.jobId, mode: 'simple' } },
      })
      await expect(memberships.getJob(neighbor.jobId)).resolves.toBeNull()
    } finally {
      const job = await memberships.getJob(owned.jobId)
      await job?.remove()
    }
  })
})
