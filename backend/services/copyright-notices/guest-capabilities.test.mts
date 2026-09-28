import {
  countCopyrightUrgentFilings,
  readCopyrightGuestCapabilityExpiresAt,
} from '@voucha/test-helpers/data-stores/psql/copyright-guest-lifecycle'
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
  authorizeCopyrightGuestCapability,
  createCopyrightNoticeAggregate,
  getCopyrightNoticePrivateAggregate,
  issueCopyrightGuestCapability,
  requestCopyrightGuestInformation,
  revokeCopyrightGuestCapability,
} from './index.mts'

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

describe('copyright guest capabilities', () => {
  it('accepts a live case token and rejects another case, expiry, and revocation', async () => {
    const first = await openNotice()
    const second = await openNotice()
    const now = new Date('2026-07-02T12:00:00.000Z')
    const capability = await issueCopyrightGuestCapability({
      noticeId: first.notice.id,
      expiresAt: new Date('2026-07-03T12:00:00.000Z'),
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
        now: new Date('2026-07-03T12:00:00.000Z'),
      }),
    ).resolves.toBeNull()
    await revokeCopyrightGuestCapability({
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

  it('appends a correction without moving receipt time or inventing a deadline', async () => {
    const { notice, receivedAt } = await openNotice()
    const capability = await issueCopyrightGuestCapability({
      noticeId: notice.id,
      expiresAt: new Date('2026-07-03T12:00:00.000Z'),
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
    expect(aggregate?.submissions.find(submission => submission.id === filing.id)?.kind).toBe(
      'supplement',
    )
    expect(aggregate?.deadlines).toEqual([])
    expect(await countCopyrightUrgentFilings(filing.id)).toBe(0)
  })

  it('records a withdrawal without lifting another notice and marks a court filing urgent', async () => {
    const held = await openNotice()
    const other = await openNotice()
    const capability = await issueCopyrightGuestCapability({
      noticeId: held.notice.id,
      expiresAt: new Date('2026-07-03T12:00:00.000Z'),
    })
    const withdrawal = await appendCopyrightGuestFiling({
      noticeId: held.notice.id,
      token: capability.token,
      now: new Date('2026-07-02T16:00:00.000Z'),
      kind: 'withdrawal',
      statement: `withdrawal-${crypto.randomUUID()}`,
    })
    const court = await appendCopyrightGuestFiling({
      noticeId: held.notice.id,
      token: capability.token,
      now: new Date('2026-07-02T17:00:00.000Z'),
      kind: 'court_or_ccb_hold',
      statement: `filing-${crypto.randomUUID()}`,
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
  })

  it('lets staff request information without extending the guest capability', async () => {
    const { notice } = await openNotice()
    const staffRecord = await createTestUserDirect()
    const staff = { ...staffRecord, roles: ['moderator'] } as typeof staffRecord
    const outsiderRecord = await createTestUserDirect()
    const outsider = { ...outsiderRecord, roles: [] } as typeof outsiderRecord
    const capability = await issueCopyrightGuestCapability({
      noticeId: notice.id,
      expiresAt: new Date('2026-07-03T12:00:00.000Z'),
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
    expect(await readCopyrightGuestCapabilityExpiresAt(capability.id)).toEqual(
      new Date('2026-07-03T12:00:00.000Z'),
    )
  })
})
