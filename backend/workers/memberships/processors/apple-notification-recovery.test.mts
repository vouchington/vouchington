import { rejectPostgresReadForTest } from '@voucha/test-helpers/injected-failures'
import { findRecoverableAppleNotificationJobs } from '@services/memberships/apple/notification-recovery'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { memberships } from '@queues/memberships/queues'
import { createTestAppleRecoveryNotification } from '@voucha/test-helpers/apple-recovery-fixtures'
import { recoverAppleNotifications } from './apple-notification-recovery.mts'

describe('recoverAppleNotifications', () => {
  it('does not dispatch an empty owned durable scan', async () => {
    const neighbor = await createTestAppleRecoveryNotification()
    const addBulk = vi.spyOn(memberships, 'addBulk')
    onTestFinished(() => addBulk.mockRestore())

    await expect(recoverAppleNotifications([], 1)).resolves.toEqual({ enqueued: 0 })
    expect(addBulk).not.toHaveBeenCalled()
    await expect(memberships.getJob(neighbor.jobId)).resolves.toBeNull()
  })
  it('propagates failures of the default global selector without executing the scan', async () => {
    const failure = new Error('Apple recovery read failed')
    const restore = rejectPostgresReadForTest('findRecoverableAppleNotificationJobs', failure)
    try {
      await expect(findRecoverableAppleNotificationJobs()).rejects.toBe(failure)
      await expect(recoverAppleNotifications()).rejects.toBe(failure)
    } finally {
      restore()
    }
  })
})
