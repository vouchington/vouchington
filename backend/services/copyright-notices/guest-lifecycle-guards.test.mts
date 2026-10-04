import { decryptSecret } from '@modules/token-secrets'
import {
  countCopyrightGuestCapabilities,
  countCopyrightUrgentFilings,
  insertGuestLifecycleCounterDeadline,
  insertGuestLifecycleRestriction,
  markCopyrightNoticeAccepted,
  readCopyrightCorrespondenceCiphertext,
  readCopyrightSubmissionCiphertext,
} from '@voucha/test-helpers/data-stores/psql/copyright-guest-lifecycle'
import {
  createTestUserDirect,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { recordTestClaimantEmailReceipt } from '@voucha/test-helpers/services/copyright-notices/claimant-delivery'
import { copyrightCorrespondencePurpose } from './correspondence.mts'
import {
  appendCopyrightGuestFiling,
  getCopyrightParticipantNoticeDetail,
  getCopyrightPublicNoticeDetail,
  issueCopyrightGuestCapability,
  requestCopyrightGuestInformation,
} from './index.mts'
import { authorizeCopyrightGuestCapability } from './guest-capabilities.mts'
import { copyrightSubmissionPurpose } from './submissions.mts'
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
      sourceKind: 'staff',
      bodyCiphertext: `notice-${crypto.randomUUID()}`,
    },
    targets: [
      {
        placementId: placement.placement_id,
        placementRevision: placement.placement_revision,
        imageId,
        bindingFamily: 'post',
        hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
      },
    ],
  })
  return { notice, owner, receivedAt }
}

describe('copyright guest lifecycle guards', () => {
  it('keeps receipt time, deadlines, and restrictions unchanged', async () => {
    const { notice, owner, receivedAt } = await openNotice()
    const actor = await createTestUserDirect()
    const capability = await issueCopyrightGuestCapability({
      currentUser: { ...actor, roles: ['moderator'] } as typeof actor,
      noticeId: notice.id,
      expiresAt: new Date('2026-07-03T12:00:00.000Z'),
    })
    const before = await getCopyrightNoticePrivateAggregate(notice.id)
    const targetId = before?.targets[0]?.id
    const submissionId = before?.submissions[0]?.id
    if (!targetId || !submissionId) throw new Error('fixture notice disappeared')
    await insertGuestLifecycleCounterDeadline({
      noticeId: notice.id,
      receivedAt,
      actorId: actor.id,
      bodyCiphertext: `counter-${crypto.randomUUID()}`,
      earliestRestorationAt: new Date('2026-07-20T00:00:00.000Z'),
      escalationAt: new Date('2026-07-21T00:00:00.000Z'),
      restorationDeadlineAt: new Date('2026-07-22T00:00:00.000Z'),
    })
    await insertGuestLifecycleRestriction({
      submissionId,
      targetId,
      receivedAt,
      actorId: actor.id,
    })
    const statement = `correction-${crypto.randomUUID()}`
    const filing = await appendCopyrightGuestFiling({
      noticeId: notice.id,
      token: capability.token,
      now: new Date('2026-07-02T15:00:00.000Z'),
      kind: 'supplement',
      statement,
    })
    const court = await appendCopyrightGuestFiling({
      noticeId: notice.id,
      token: capability.token,
      now: new Date('2026-07-02T16:00:00.000Z'),
      kind: 'court_or_ccb_hold',
      statement: `court-${crypto.randomUUID()}`,
    })
    await appendCopyrightGuestFiling({
      noticeId: notice.id,
      token: capability.token,
      now: new Date('2026-07-02T17:00:00.000Z'),
      kind: 'withdrawal',
      statement: `withdrawal-${crypto.randomUUID()}`,
    })
    const after = await getCopyrightNoticePrivateAggregate(notice.id)
    expect(after?.notice.received_at).toEqual(receivedAt)
    expect(after?.deadlines).toEqual([
      expect.objectContaining({
        earliest_restoration_at: new Date('2026-07-20T00:00:00.000Z'),
        restoration_deadline_at: new Date('2026-07-22T00:00:00.000Z'),
        cancelled_at: null,
      }),
    ])
    expect(after?.restrictions).toEqual([
      expect.objectContaining({ lifted_at: null, copyright_notice_target_id: targetId }),
    ])
    expect(after?.holdAssessments).toEqual([])
    const stored = await readCopyrightSubmissionCiphertext(filing.id)
    expect(stored).not.toBe(statement)
    expect(decryptSecret(stored, copyrightSubmissionPurpose(filing.id))).toBe(statement)
    expect(await countCopyrightUrgentFilings(court.id)).toBe(1)
    await markCopyrightNoticeAccepted(notice.id, receivedAt)
    const viewer = { ...owner, roles: [] as const }
    const participant = await getCopyrightParticipantNoticeDetail(notice.id, viewer)
    const publicDetail = await getCopyrightPublicNoticeDetail(notice.id)
    const projected = JSON.stringify({ participant, publicDetail })
    expect(projected).not.toContain('ciphertext')
    expect(projected).not.toContain(capability.token)
    expect(projected).not.toContain(statement)
    expect(Object.keys(publicDetail ?? {}).toSorted()).toEqual([
      'accepted_at',
      'claimant',
      'id',
      'jurisdiction',
      'provisional_withholding_at',
      'received_at',
      'target_count',
      'targets',
      'timeline',
    ])
  })

  it('does not treat mail or a staff information request as a capability', async () => {
    const { notice } = await openNotice()
    await recordTestClaimantEmailReceipt(notice.id)
    const staffRecord = await createTestUserDirect()
    const staff = { ...staffRecord, roles: ['moderator'] as const }
    const capability = await issueCopyrightGuestCapability({
      currentUser: staff,
      noticeId: notice.id,
      expiresAt: new Date('2026-07-03T12:00:00.000Z'),
    })
    const request = await requestCopyrightGuestInformation({
      currentUser: staff,
      noticeId: notice.id,
      capabilityId: capability.id,
      statement: `Please send the registration ${crypto.randomUUID()}`,
    })
    const stored = await readCopyrightCorrespondenceCiphertext(request.id)
    expect(decryptSecret(stored, copyrightCorrespondencePurpose(request.id))).toContain(
      'Please send the registration',
    )
    await expect(
      authorizeCopyrightGuestCapability({
        noticeId: notice.id,
        token: 'spoofed@example.test',
        now: new Date('2026-07-02T12:00:00.000Z'),
      }),
    ).resolves.toBeNull()
    expect(await countCopyrightGuestCapabilities(notice.id)).toBe(1)
  })
})
