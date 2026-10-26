import { readCopyrightGuestCapabilityExpiresAt } from '@voucha/test-helpers/data-stores/psql/copyright-guest-lifecycle'
import {
  createTestCopyrightStaff,
  openTestGuestCopyrightNotice,
} from '@voucha/test-helpers/services/copyright-notices/guest-capability'
import { describe, expect, it } from 'vitest'
import { issueCopyrightGuestCapability } from './guest-capabilities.mts'

describe('copyright guest capability expiry boundary', () => {
  it('accepts exactly 30 days across UTC month boundaries and rejects one millisecond more', async () => {
    const noticeId = await openTestGuestCopyrightNotice(new Date('2026-07-01T12:00:00.000Z'))
    const currentUser = await createTestCopyrightStaff()
    for (const instant of ['2026-07-31T23:59:59.999Z', '2026-08-01T00:00:00.000Z']) {
      const issuedAt = new Date(instant)
      const expiresAt = new Date(issuedAt.getTime() + 30 * 24 * 60 * 60 * 1000)
      const capability = await issueCopyrightGuestCapability({
        currentUser,
        noticeId,
        issuedAt,
        expiresAt,
      })
      expect(await readCopyrightGuestCapabilityExpiresAt(capability.id)).toEqual(expiresAt)
      await expect(
        issueCopyrightGuestCapability({
          currentUser,
          noticeId,
          issuedAt,
          expiresAt: new Date(expiresAt.getTime() + 1),
        }),
      ).rejects.toMatchObject({ status: 422, message: 'Guest capabilities expire within 30 days' })
    }
    await expect(
      issueCopyrightGuestCapability({
        currentUser,
        noticeId,
        issuedAt: new Date(Number.NaN),
        expiresAt: new Date('2026-08-30T23:59:59.999Z'),
      }),
    ).rejects.toThrow('issuedAt must be a valid instant')
  })
})
