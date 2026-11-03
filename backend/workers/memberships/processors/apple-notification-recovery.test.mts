import { afterEach, describe, expect, it, vi } from 'vitest'
import { memberships } from '@queues/memberships/queues'
import { recoverAppleNotifications } from './apple-notification-recovery.mts'

describe('recoverAppleNotifications', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not dispatch an empty durable scan', async () => {
    const addBulk = vi.spyOn(memberships, 'addBulk')

    await expect(recoverAppleNotifications(async () => [])).resolves.toEqual({ enqueued: 0 })
    expect(addBulk).not.toHaveBeenCalled()
  })
})
