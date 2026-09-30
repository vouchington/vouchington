import { createTestUserDirect } from '@voucha/test-helpers'
import {
  createTestCopyrightStaff,
  openTestGuestCopyrightNotice,
} from '@voucha/test-helpers/services/copyright-notices/guest-capability'
import { describe, expect, it } from 'vitest'
import {
  issueCopyrightGuestCapability,
  listCopyrightGuestCapabilities,
  revokeCopyrightGuestCapability,
} from './index.mts'

const dayMs = 24 * 60 * 60 * 1000

describe('listCopyrightGuestCapabilities', () => {
  it('lists a case’s capabilities newest first with issuer and state but no token', async () => {
    const noticeId = await openTestGuestCopyrightNotice()
    const otherNoticeId = await openTestGuestCopyrightNotice()
    const staff = await createTestCopyrightStaff()
    const expiresAt = new Date(Date.now() + 7 * dayMs)
    const older = await issueCopyrightGuestCapability({ currentUser: staff, noticeId, expiresAt })
    const newer = await issueCopyrightGuestCapability({ currentUser: staff, noticeId, expiresAt })
    await issueCopyrightGuestCapability({ currentUser: staff, noticeId: otherNoticeId, expiresAt })
    const revokedAt = new Date()
    await revokeCopyrightGuestCapability({
      currentUser: staff,
      noticeId,
      capabilityId: older.id,
      revokedAt,
    })
    const firstPage = await listCopyrightGuestCapabilities({
      currentUser: staff,
      noticeId,
      limit: 1,
    })
    expect(firstPage).toEqual({
      results: [
        {
          id: newer.id,
          issued_at: expect.any(Date),
          issued_by_id: staff.id,
          issued_by_username: staff.username,
          expires_at: expiresAt,
          revoked_at: null,
        },
      ],
      hasNextPage: true,
    })
    const secondPage = await listCopyrightGuestCapabilities({
      currentUser: staff,
      noticeId,
      limit: 1,
      afterId: newer.id,
    })
    expect(secondPage).toEqual({
      results: [expect.objectContaining({ id: older.id, revoked_at: revokedAt })],
      hasNextPage: false,
    })
    expect(JSON.stringify([firstPage, secondPage])).not.toContain(older.token)
    expect(JSON.stringify([firstPage, secondPage])).not.toContain(newer.token)
  })

  it('refuses non-staff viewers', async () => {
    const noticeId = await openTestGuestCopyrightNotice()
    const outsiderRecord = await createTestUserDirect()
    const outsider = { ...outsiderRecord, roles: [] } as typeof outsiderRecord
    await expect(
      listCopyrightGuestCapabilities({ currentUser: outsider, noticeId, limit: 25 }),
    ).rejects.toMatchObject({ status: 403 })
  })
})
