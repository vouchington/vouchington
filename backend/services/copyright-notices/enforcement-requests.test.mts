import { describe, expect, it, vi } from 'vitest'
import {
  countCopyrightActiveRestrictionsForNotice,
  readCopyrightEnforcementRequest,
} from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightSubmissionAssessment,
  createCopyrightDeliveryIntent,
  createCopyrightNoticeAggregate,
  createOutboundCopyrightCorrespondence,
  getCopyrightNoticePrivateAggregate,
  processCopyrightEnforcementRequest,
} from './index.mts'
import {
  createTestUserDirect,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'

async function createEnforcementFixture() {
  const [claimant, moderatorRecord] = await Promise.all([
    createTestUserDirect(),
    createTestUserDirect(),
  ])
  const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
  const postId = await insertTestPost({
    title: `copyright enforcement ${crypto.randomUUID()}`,
    slug: `copyright-enforcement-${crypto.randomUUID()}`,
    createdById: claimant.id,
    markdown: 'image',
  })
  const imageId = await insertTestImage(claimant.id)
  await insertTestPostImage({ postId, imageId })
  const placement = await getTestPostImagePlacement(postId, imageId)
  if (!placement) throw new Error('fixture image placement disappeared')
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date('2026-06-30T16:00:00.000Z'),
    claimantUserId: claimant.id,
    claimantDisplayName: 'private snapshot',
    claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
    workDescription: `work-${crypto.randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: { kind: 'notice', sourceKind: 'signed_in_form', bodyCiphertext: 'notice' },
    targets: [
      {
        placementKey: `image-placement:${placement.placement_id}`,
        placementRevision: placement.placement_revision,
        imageId,
        hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
      },
    ],
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  if (!aggregate) throw new Error('fixture notice disappeared')
  const submission = aggregate.submissions[0]!
  const correspondence = await createOutboundCopyrightCorrespondence({
    noticeId: notice.id,
    submissionId: submission.id,
    correspondenceKind: 'receipt',
    compositionKind: 'deterministic_template',
    bodyCiphertext: `receipt-${crypto.randomUUID()}`,
    draftedById: null,
  })
  await createCopyrightDeliveryIntent({
    noticeId: notice.id,
    submissionId: submission.id,
    correspondenceId: correspondence.id,
    recipientUserId: null,
    recipientRole: 'claimant',
    deliveryKind: 'claimant_receipt',
    channel: 'email',
    idempotencyKey: `copyright-receipt-${crypto.randomUUID()}`,
    recipientEmail: `tests+copyright-${crypto.randomUUID()}@voucha.ai`,
  })
  const assessment = await appendCopyrightSubmissionAssessment({
    submissionId: submission.id,
    assessedAt: new Date('2026-07-01T11:00:00.000Z'),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  return { assessment, moderator, notice, submission }
}

describe('copyright enforcement requests', () => {
  it('terminalizes a request whose assessment was rejected before its worker runs', async () => {
    const { assessment, moderator, notice, submission } = await createEnforcementFixture()
    await appendCopyrightSubmissionAssessment({
      submissionId: submission.id,
      assessedAt: new Date('2026-07-01T12:00:00.000Z'),
      currentUser: moderator,
      substantiallyCompliant: false,
      supersedesAssessmentId: assessment.id,
    })

    await expect(processCopyrightEnforcementRequest(assessment.id)).resolves.toBe('completed')
    await expect(countCopyrightActiveRestrictionsForNotice(notice.id)).resolves.toBe(0)
    await expect(readCopyrightEnforcementRequest(assessment.id)).resolves.toEqual({
      state: 'completed',
      completed_at: expect.any(Date),
    })
  })

  it('terminalizes stale authority discovered after the request is claimed', async () => {
    const { assessment, moderator, notice, submission } = await createEnforcementFixture()
    const supersedeBeforeImposing = vi
      .fn<typeof acceptCopyrightNoticeAndImposeRestriction>()
      .mockImplementation(async input => {
        await appendCopyrightSubmissionAssessment({
          submissionId: submission.id,
          assessedAt: new Date('2026-07-01T12:00:00.000Z'),
          currentUser: moderator,
          substantiallyCompliant: false,
          supersedesAssessmentId: assessment.id,
        })
        return await acceptCopyrightNoticeAndImposeRestriction(input)
      })

    await expect(
      processCopyrightEnforcementRequest(assessment.id, {
        imposeRestriction: supersedeBeforeImposing,
      }),
    ).resolves.toBe('completed')
    expect(supersedeBeforeImposing).toHaveBeenCalledOnce()
    await expect(countCopyrightActiveRestrictionsForNotice(notice.id)).resolves.toBe(0)
    await expect(readCopyrightEnforcementRequest(assessment.id)).resolves.toEqual({
      state: 'completed',
      completed_at: expect.any(Date),
    })
  })

  it('imposes an unchanged compliant assessment once', async () => {
    const { assessment, notice } = await createEnforcementFixture()

    await expect(processCopyrightEnforcementRequest(assessment.id)).resolves.toBe('completed')
    await expect(processCopyrightEnforcementRequest(assessment.id)).resolves.toBe('not_claimed')
    await expect(countCopyrightActiveRestrictionsForNotice(notice.id)).resolves.toBe(1)
  })
})
