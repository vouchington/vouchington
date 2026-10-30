import {
  countCopyrightGuestCapabilities,
  listCopyrightGuestCapabilityEvents,
  readCopyrightGuestCapabilityState,
} from '@voucha/test-helpers/data-stores/psql/copyright-guest-lifecycle'
import {
  acceptCounterNoticeForRestoration,
  createCopyrightRestorationHoldFixture,
} from '@voucha/test-helpers/copyright-restoration-hold-fixtures'
import { withCopyrightCaseErasureExclusiveLock } from '@voucha/test-helpers/copyright-guest-capability-lock-order'
import {
  createTestCopyrightStaff,
  openTestGuestCopyrightNotice,
} from '@voucha/test-helpers/services/copyright-notices/guest-capability'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { describe, expect, it } from 'vitest'
import {
  appendCopyrightGuestFiling,
  createCopyrightCounterNotice,
  issueCopyrightGuestCapability,
  revokeCopyrightGuestCapability,
  requestCopyrightGuestInformation,
} from './index.mts'
import { createEligibleCopyrightRestoreIntent } from './restoration.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from './restrictions.mts'

const dayMs = 24 * 60 * 60 * 1000
const counterNoticeBody = {
  name: 'Poster',
  address: '1 Main Street',
  telephone: '555-0100',
  consentToFederalJurisdiction: true,
  consentToServiceOfProcess: true,
  goodFaithMisidentificationUnderPenaltyOfPerjury: true,
  electronicSignature: 'Poster',
}

describe('copyright guest capability case-lifetime ordering', () => {
  it('rejects issuance, revocation, and filing while erasure owns the case lifetime', async () => {
    const noticeId = await openTestGuestCopyrightNotice()
    const staff = await createTestCopyrightStaff()
    const issuedAt = new Date()
    const capability = await issueCopyrightGuestCapability({
      currentUser: staff,
      noticeId,
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + 7 * dayMs),
    })
    const beforeCount = await countCopyrightGuestCapabilities(noticeId)
    const beforeEvents = await listCopyrightGuestCapabilityEvents(capability.id)
    const now = new Date()

    await withCopyrightCaseErasureExclusiveLock(noticeId, async () => {
      await expect(
        issueCopyrightGuestCapability({
          currentUser: staff,
          noticeId,
          issuedAt: now,
          expiresAt: new Date(now.getTime() + 7 * dayMs),
        }),
      ).rejects.toMatchObject({ status: 409, message: 'Copyright case erasure is in progress' })
      await expect(
        revokeCopyrightGuestCapability({
          currentUser: staff,
          noticeId,
          capabilityId: capability.id,
          revokedAt: now,
        }),
      ).rejects.toMatchObject({ status: 409, message: 'Copyright case erasure is in progress' })
      await expect(
        requestCopyrightGuestInformation({
          currentUser: staff,
          noticeId,
          capabilityId: capability.id,
          statement: 'Please provide the missing information.',
        }),
      ).rejects.toMatchObject({ status: 409, message: 'Copyright case erasure is in progress' })
      await expect(
        appendCopyrightGuestFiling({
          noticeId,
          token: capability.token,
          now,
          kind: 'withdrawal',
          statement: `withdrawal-${crypto.randomUUID()}`,
        }),
      ).rejects.toMatchObject({ status: 409, message: 'Copyright case erasure is in progress' })
    })

    expect(await countCopyrightGuestCapabilities(noticeId)).toBe(beforeCount)
    expect(await readCopyrightGuestCapabilityState(capability.id)).toMatchObject({
      revoked_at: null,
    })
    expect(await listCopyrightGuestCapabilityEvents(capability.id)).toEqual(beforeEvents)
    expect((await getCopyrightNoticePrivateAggregate(noticeId))?.submissions).toHaveLength(1)
  })

  it('rejects restore-intent creation before child writes while erasure owns the case lifetime', async () => {
    const fixture = await createCopyrightRestorationHoldFixture()
    const target = fixture.aggregate.targets[0]!
    const restriction = await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: fixture.notice.id,
      targetId: target.id,
      assessmentId: fixture.assessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      imposedById: fixture.moderator.id,
    })
    const counterNotice = await createCopyrightCounterNotice(
      fixture.claimant,
      fixture.notice.id,
      crypto.randomUUID(),
      { ...counterNoticeBody, targetIds: [target.id] },
    )
    const { deadline } = await acceptCounterNoticeForRestoration({
      noticeId: fixture.notice.id,
      submissionId: counterNotice.submission.id,
      moderator: fixture.moderator,
    })
    const input = {
      noticeId: fixture.notice.id,
      targetId: target.id,
      restrictionId: restriction.id,
      deadlineId: deadline.id,
      expectedPlacementRevision: target.placement_revision,
      now: new Date(deadline.earliest_restoration_at.getTime() + 60_000),
    }
    const before = await getCopyrightNoticePrivateAggregate(fixture.notice.id)

    await withCopyrightCaseErasureExclusiveLock(fixture.notice.id, async () => {
      await expect(createEligibleCopyrightRestoreIntent(input)).rejects.toMatchObject({
        status: 409,
        message: 'Copyright case erasure is in progress',
      })
    })

    const after = await getCopyrightNoticePrivateAggregate(fixture.notice.id)
    expect(after?.actionIntents).toEqual(before?.actionIntents)
    expect(after?.lifecycleEvents).toEqual(before?.lifecycleEvents)
  })
})
