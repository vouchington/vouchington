import { describe, expect, it, vi } from 'vitest'
import type { enqueueBulkProcessAppleNotifications } from '@queues/memberships/enqueues'
import type { findRecoverableAppleNotificationJobs } from '@services/memberships/apple/notification-recovery'
import { recoverAppleNotifications } from './apple-notification-recovery.mts'

describe('recoverAppleNotifications', () => {
  it('awaits a bulk enqueue of every pending durable notification', async () => {
    const notifications = [
      { evidenceId: 'evidence-1', providerLineageId: 'lineage-1', environment: 'test' as const },
    ]
    const find = vi
      .fn<typeof findRecoverableAppleNotificationJobs>()
      .mockResolvedValue(notifications)
    const enqueue = vi.fn<typeof enqueueBulkProcessAppleNotifications>().mockResolvedValue([])

    await expect(
      recoverAppleNotifications({
        findRecoverableAppleNotificationJobs: find,
        enqueueBulkProcessAppleNotifications: enqueue,
      }),
    ).resolves.toEqual({ enqueued: 1 })
    expect(enqueue).toHaveBeenCalledWith(notifications)
  })

  it('does not dispatch an empty durable scan', async () => {
    const find = vi.fn<typeof findRecoverableAppleNotificationJobs>().mockResolvedValue([])
    const enqueue = vi.fn<typeof enqueueBulkProcessAppleNotifications>()

    await expect(
      recoverAppleNotifications({
        findRecoverableAppleNotificationJobs: find,
        enqueueBulkProcessAppleNotifications: enqueue,
      }),
    ).resolves.toEqual({ enqueued: 0 })
    expect(enqueue).not.toHaveBeenCalled()
  })
})
