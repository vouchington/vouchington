import {
  listCopyrightGuestCapabilityEvents,
  readCopyrightGuestCapabilityState,
} from '@voucha/test-helpers/data-stores/psql/copyright-guest-lifecycle'
import {
  admitTestCopyrightEmailWithdrawal,
  createTestCopyrightStaff,
  openTestGuestCopyrightNotice,
} from '@voucha/test-helpers/services/copyright-notices/guest-capability'
import { describe, expect, it } from 'vitest'
import {
  appendCopyrightGuestFiling,
  issueCopyrightGuestCapability,
  revokeCopyrightGuestCapability,
} from './index.mts'
import { authorizeCopyrightGuestCapability } from './guest-capabilities.mts'

const dayMs = 24 * 60 * 60 * 1000

describe('copyright guest capability revocation on withdrawal', () => {
  it('revokes every live token on the case when a guest files a withdrawal', async () => {
    const noticeId = await openTestGuestCopyrightNotice()
    const otherNoticeId = await openTestGuestCopyrightNotice()
    const staff = await createTestCopyrightStaff()
    const expiresAt = new Date(Date.now() + 7 * dayMs)
    const issue = (id: string) =>
      issueCopyrightGuestCapability({ currentUser: staff, noticeId: id, expiresAt })
    const [filer, sibling, alreadyRevoked, otherCase] = await Promise.all([
      issue(noticeId),
      issue(noticeId),
      issue(noticeId),
      issue(otherNoticeId),
    ])
    const staffRevokedAt = new Date(Date.now() - 60_000)
    await revokeCopyrightGuestCapability({
      currentUser: staff,
      noticeId,
      capabilityId: alreadyRevoked.id,
      revokedAt: staffRevokedAt,
    })
    const now = new Date()
    await appendCopyrightGuestFiling({
      noticeId,
      token: filer.token,
      now,
      kind: 'withdrawal',
      statement: `withdrawal-${crypto.randomUUID()}`,
    })
    for (const capability of [filer, sibling]) {
      expect(await readCopyrightGuestCapabilityState(capability.id)).toEqual({
        issued_by_id: staff.id,
        revoked_at: now,
      })
      expect(await listCopyrightGuestCapabilityEvents(capability.id)).toEqual([
        { event_type: 'guest_capability_issued', actor_user_id: staff.id },
        { event_type: 'guest_capability_revoked_by_withdrawal', actor_user_id: null },
      ])
      await expect(
        authorizeCopyrightGuestCapability({ noticeId, token: capability.token, now }),
      ).resolves.toBeNull()
    }
    expect((await readCopyrightGuestCapabilityState(alreadyRevoked.id)).revoked_at).toEqual(
      staffRevokedAt,
    )
    expect(await listCopyrightGuestCapabilityEvents(alreadyRevoked.id)).toEqual([
      { event_type: 'guest_capability_issued', actor_user_id: staff.id },
      { event_type: 'guest_capability_revoked', actor_user_id: staff.id },
    ])
    await expect(
      authorizeCopyrightGuestCapability({
        noticeId: otherNoticeId,
        token: otherCase.token,
        now,
      }),
    ).resolves.toBe(otherCase.id)
  })

  it('revokes the case tokens when staff admit an emailed withdrawal', async () => {
    const noticeId = await openTestGuestCopyrightNotice()
    const staff = await createTestCopyrightStaff()
    const capability = await issueCopyrightGuestCapability({
      currentUser: staff,
      noticeId,
      expiresAt: new Date(Date.now() + 7 * dayMs),
    })
    await admitTestCopyrightEmailWithdrawal({ noticeId, moderator: staff })
    expect((await readCopyrightGuestCapabilityState(capability.id)).revoked_at).toEqual(
      expect.any(Date),
    )
    expect(await listCopyrightGuestCapabilityEvents(capability.id)).toEqual([
      { event_type: 'guest_capability_issued', actor_user_id: staff.id },
      { event_type: 'guest_capability_revoked_by_withdrawal', actor_user_id: null },
    ])
    await expect(
      authorizeCopyrightGuestCapability({ noticeId, token: capability.token, now: new Date() }),
    ).resolves.toBeNull()
  })
})
