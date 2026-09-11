import { describe, expect, it, vi } from 'vitest'
import type { enqueueBulkProcessMembershipVerifications } from '@queues/memberships/enqueues'
import type { findRecoverableMembershipVerificationIds } from '@services/memberships'
import { recoverMembershipVerifications } from './verification-recovery.mts'

describe('recoverMembershipVerifications', () => {
  it('awaits a bulk enqueue of every pending durable verification', async () => {
    const verificationIds = ['verification-1', 'verification-2']
    const find = vi
      .fn<typeof findRecoverableMembershipVerificationIds>()
      .mockResolvedValue(verificationIds)
    const enqueue = vi.fn<typeof enqueueBulkProcessMembershipVerifications>().mockResolvedValue([])

    await expect(
      recoverMembershipVerifications({
        findRecoverableMembershipVerificationIds: find,
        enqueueBulkProcessMembershipVerifications: enqueue,
      }),
    ).resolves.toEqual({ enqueued: 2 })
    expect(enqueue).toHaveBeenCalledWith([
      { verificationId: 'verification-1' },
      { verificationId: 'verification-2' },
    ])
  })

  it('does not dispatch an empty durable scan', async () => {
    const find = vi.fn<typeof findRecoverableMembershipVerificationIds>().mockResolvedValue([])
    const enqueue = vi.fn<typeof enqueueBulkProcessMembershipVerifications>()

    await expect(
      recoverMembershipVerifications({
        findRecoverableMembershipVerificationIds: find,
        enqueueBulkProcessMembershipVerifications: enqueue,
      }),
    ).resolves.toEqual({ enqueued: 0 })
    expect(enqueue).not.toHaveBeenCalled()
  })
})
