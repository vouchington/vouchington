import {
  countCopyrightUrgentFilings,
  listCopyrightGuestCapabilityEvents,
  readCopyrightGuestCapabilityExpiresAt,
  readCopyrightGuestCapabilityState,
} from '@voucha/test-helpers/data-stores/psql/copyright-guest-lifecycle'
import { createTestCopyrightStaff } from '@voucha/test-helpers/services/copyright-notices/guest-capability'
import { recordTestClaimantEmailReceipt } from '@voucha/test-helpers/services/copyright-notices/claimant-delivery'
import {
  createTestUserDirect,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import {
  appendCopyrightGuestFiling,
  issueCopyrightGuestCapability,
  requestCopyrightGuestInformation,
  revokeCopyrightGuestCapability,
} from './index.mts'
import {
  authorizeCopyrightGuestCapability,
  copyrightGuestCapabilityMaxLifetimeMs,
} from './guest-capabilities.mts'

import { createCopyrightNoticeAggregate } from '@voucha/test-helpers/services/copyright-notices/create-notice-aggregate'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

async function openNotice() {
  const owner = await createTestUserDirect()
  const imageId = await insertTestImage(owner.id)
  const postId = await insertTestPost({
    title: `guest copyright ${crypto.randomUUID()}`,
    slug: `guest-copyright-${crypto.randomUUID()}`,
    createdById: owner.id,
    markdown: 'image',
  })
  await insertTestPostImage({ postId, imageId })
  const placement = await getTestPostImagePlacement(postId, imageId)
  if (!placement) throw new Error('fixture image placement disappeared')
  const receivedAt = new Date('2026-07-01T12:00:00.000Z')
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt,
    claimantUserId: null,
    claimantDisplayName: null,
    claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
    workDescription: `work-${crypto.randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'guest_form',
      bodyCiphertext: `notice-${crypto.randomUUID()}`,
    },
    targets: [
      {
        placementId: placement.placement_id,
        placementRevision: placement.placement_revision,
        imageId,
        hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
      },
    ],
  })
  return { notice, receivedAt }
}

const expiresAt = new Date('2026-07-03T12:00:00.000Z')

describe('copyright guest capabilities', () => {
  it('accepts a live case token and rejects another case, expiry, and revocation', async () => {
    const first = await openNotice()
    const second = await openNotice()
    const staff = await createTestCopyrightStaff()
    const now = new Date('2026-07-02T12:00:00.000Z')
    const capability = await issueCopyrightGuestCapability({
      currentUser: staff,
      noticeId: first.notice.id,
      expiresAt,
    })
    await expect(
      authorizeCopyrightGuestCapability({
        noticeId: first.notice.id,
        token: capability.token,
        now,
      }),
    ).resolves.toBe(capability.id)
    await expect(
      authorizeCopyrightGuestCapability({
        noticeId: second.notice.id,
        token: capability.token,
        now,
      }),
    ).resolves.toBeNull()
    await expect(
      authorizeCopyrightGuestCapability({
        noticeId: first.notice.id,
        token: capability.token,
        now: expiresAt,
      }),
    ).resolves.toBeNull()
    await revokeCopyrightGuestCapability({
      currentUser: staff,
      noticeId: first.notice.id,
      capabilityId: capability.id,
      revokedAt: now,
    })
    await expect(
      authorizeCopyrightGuestCapability({
        noticeId: first.notice.id,
        token: capability.token,
        now,
      }),
    ).resolves.toBeNull()
  })

  it('records the issuing and revoking staff member as lifecycle events', async () => {
    const { notice } = await openNotice()
    const issuer = await createTestCopyrightStaff()
    const revoker = await createTestCopyrightStaff()
    const capability = await issueCopyrightGuestCapability({
      currentUser: issuer,
      noticeId: notice.id,
      expiresAt,
    })
    expect(await readCopyrightGuestCapabilityState(capability.id)).toEqual({
      issued_by_id: issuer.id,
      revoked_at: null,
    })
    const revokedAt = new Date('2026-07-02T12:00:00.000Z')
    await revokeCopyrightGuestCapability({
      currentUser: revoker,
      noticeId: notice.id,
      capabilityId: capability.id,
      revokedAt,
    })
    expect(await readCopyrightGuestCapabilityState(capability.id)).toEqual({
      issued_by_id: issuer.id,
      revoked_at: revokedAt,
    })
    expect(await listCopyrightGuestCapabilityEvents(capability.id)).toEqual([
      { event_type: 'guest_capability_issued', actor_user_id: issuer.id },
      { event_type: 'guest_capability_revoked', actor_user_id: revoker.id },
    ])
  })

  it('caps expiry at 30 days and limits issuing and revoking to staff', async () => {
    const { notice } = await openNotice()
    const staff = await createTestCopyrightStaff()
    const outsiderRecord = await createTestUserDirect()
    const outsider = { ...outsiderRecord, roles: [] } as typeof outsiderRecord
    await expect(
      issueCopyrightGuestCapability({
        currentUser: staff,
        noticeId: notice.id,
        expiresAt: new Date(Date.now() + copyrightGuestCapabilityMaxLifetimeMs + 60_000),
      }),
    ).rejects.toMatchObject({ status: 422, message: 'Guest capabilities expire within 30 days' })
    await expect(
      issueCopyrightGuestCapability({ currentUser: outsider, noticeId: notice.id, expiresAt }),
    ).rejects.toMatchObject({ status: 403 })
    const capability = await issueCopyrightGuestCapability({
      currentUser: staff,
      noticeId: notice.id,
      expiresAt: new Date(Date.now() + copyrightGuestCapabilityMaxLifetimeMs - 60_000),
    })
    await expect(
      revokeCopyrightGuestCapability({
        currentUser: outsider,
        noticeId: notice.id,
        capabilityId: capability.id,
        revokedAt: new Date(),
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('appends a correction without moving receipt time or inventing a deadline', async () => {
    const { notice, receivedAt } = await openNotice()
    const capability = await issueCopyrightGuestCapability({
      currentUser: await createTestCopyrightStaff(),
      noticeId: notice.id,
      expiresAt,
    })
    const filing = await appendCopyrightGuestFiling({
      noticeId: notice.id,
      token: capability.token,
      now: new Date('2026-07-02T15:00:00.000Z'),
      kind: 'supplement',
      statement: `correction-${crypto.randomUUID()}`,
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
    expect(aggregate?.notice.received_at).toEqual(receivedAt)
    expect(aggregate?.submissions.find(submission => submission.id === filing.id)).toMatchObject({
      kind: 'supplement',
      copyright_notice_guest_capability_id: capability.id,
    })
    expect(aggregate?.deadlines).toEqual([])
    expect(await countCopyrightUrgentFilings(filing.id)).toBe(0)
  })

  it('marks one court filing per capability urgent and records a later withdrawal', async () => {
    const held = await openNotice()
    const other = await openNotice()
    const staff = await createTestCopyrightStaff()
    const [capability, secondCapability] = await Promise.all([
      issueCopyrightGuestCapability({ currentUser: staff, noticeId: held.notice.id, expiresAt }),
      issueCopyrightGuestCapability({ currentUser: staff, noticeId: held.notice.id, expiresAt }),
    ])
    const courtFiling = (token: string, now: string) =>
      appendCopyrightGuestFiling({
        noticeId: held.notice.id,
        token,
        now: new Date(now),
        kind: 'court_or_ccb_hold',
        statement: `filing-${crypto.randomUUID()}`,
      })
    const court = await courtFiling(capability.token, '2026-07-02T15:00:00.000Z')
    await expect(courtFiling(capability.token, '2026-07-02T15:30:00.000Z')).rejects.toMatchObject({
      status: 409,
    })
    const secondCourt = await courtFiling(secondCapability.token, '2026-07-02T15:45:00.000Z')
    const withdrawal = await appendCopyrightGuestFiling({
      noticeId: held.notice.id,
      token: capability.token,
      now: new Date('2026-07-02T16:00:00.000Z'),
      kind: 'withdrawal',
      statement: `withdrawal-${crypto.randomUUID()}`,
    })
    const heldAggregate = await getCopyrightNoticePrivateAggregate(held.notice.id)
    const otherAggregate = await getCopyrightNoticePrivateAggregate(other.notice.id)
    expect(heldAggregate?.restrictions).toEqual([])
    expect(otherAggregate?.submissions).toHaveLength(1)
    expect(
      heldAggregate?.lifecycleEvents.find(
        event => event.copyright_notice_submission_id === withdrawal.id,
      )?.event_type,
    ).toBe('withdrawal_received')
    expect(await countCopyrightUrgentFilings(court.id)).toBe(1)
    expect(await countCopyrightUrgentFilings(secondCourt.id)).toBe(1)
  })

  it('lets staff request information without extending the guest capability', async () => {
    const { notice } = await openNotice()
    await recordTestClaimantEmailReceipt(notice.id)
    const staff = await createTestCopyrightStaff()
    const outsiderRecord = await createTestUserDirect()
    const outsider = { ...outsiderRecord, roles: [] } as typeof outsiderRecord
    const capability = await issueCopyrightGuestCapability({
      currentUser: staff,
      noticeId: notice.id,
      expiresAt,
    })
    await expect(
      requestCopyrightGuestInformation({
        currentUser: outsider,
        noticeId: notice.id,
        capabilityId: capability.id,
        statement: `more-${crypto.randomUUID()}`,
      }),
    ).rejects.toThrow('Only copyright staff can request information')
    await requestCopyrightGuestInformation({
      currentUser: staff,
      noticeId: notice.id,
      capabilityId: capability.id,
      statement: `more-${crypto.randomUUID()}`,
    })
    expect(await readCopyrightGuestCapabilityExpiresAt(capability.id)).toEqual(expiresAt)
  })
})
