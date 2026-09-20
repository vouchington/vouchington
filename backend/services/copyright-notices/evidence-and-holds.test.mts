import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightEvidenceArtifact,
  appendCopyrightLegalHoldAssessment,
  appendCopyrightNoticeSubmission,
  appendCopyrightSubmissionAssessment,
  createCopyrightCounterNotice,
  createCopyrightDeliveryIntent,
  createCopyrightNoticeAggregate,
  createOutboundCopyrightCorrespondence,
  createCounterNoticeDeadline,
  createEligibleCopyrightRestoreIntent,
  getCopyrightNoticePrivateAggregate,
  resolveCopyrightLegalHold,
} from './index.mts'

async function createTwoTargetFixture() {
  const [claimant, moderatorRecord] = await Promise.all([
    createTestUserDirect(),
    createTestUserDirect(),
  ])
  const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
  const imageIds = await Promise.all([insertTestImage(claimant.id), insertTestImage(claimant.id)])
  const postId = await insertTestPost({
    title: `copyright evidence ${crypto.randomUUID()}`,
    slug: `copyright-evidence-${crypto.randomUUID()}`,
    createdById: claimant.id,
    markdown: 'images',
  })
  await Promise.all(imageIds.map(imageId => insertTestPostImage({ postId, imageId })))
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date('2026-06-30T16:00:00.000Z'),
    claimantUserId: claimant.id,
    claimantDisplayName: null,
    claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
    workDescription: `work-${crypto.randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: { kind: 'notice', sourceKind: 'signed_in_form', bodyCiphertext: 'notice' },
    targets: await Promise.all(
      imageIds.map(async imageId => {
        const placement = await getTestPostImagePlacement(postId, imageId)
        if (!placement) throw new Error('fixture image placement disappeared')
        return {
          placementKey: `image-placement:${placement.placement_id}`,
          placementRevision: placement.placement_revision,
          imageId,
          hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
        }
      }),
    ),
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  if (!aggregate) throw new Error('fixture notice disappeared')
  const noticeAssessment = await appendCopyrightSubmissionAssessment({
    submissionId: aggregate.submissions[0].id,
    assessedAt: new Date('2026-07-01T11:00:00.000Z'),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  const receipt = await createOutboundCopyrightCorrespondence({
    noticeId: notice.id,
    submissionId: aggregate.submissions[0].id,
    correspondenceKind: 'receipt',
    compositionKind: 'deterministic_template',
    bodyCiphertext: `receipt-${crypto.randomUUID()}`,
    draftedById: null,
  })
  await createCopyrightDeliveryIntent({
    noticeId: notice.id,
    submissionId: aggregate.submissions[0].id,
    correspondenceId: receipt.id,
    recipientUserId: null,
    recipientRole: 'claimant',
    deliveryKind: 'claimant_receipt',
    channel: 'email',
    idempotencyKey: `copyright-evidence-receipt-${crypto.randomUUID()}`,
    recipientEmail: `tests+copyright-${crypto.randomUUID()}@voucha.ai`,
  })
  return { aggregate, claimant, moderator, notice, noticeAssessment }
}

describe('copyright notice evidence and holds', () => {
  it('retains evidence and scopes a qualifying hold to only its identified target', async () => {
    const { aggregate, claimant, moderator, notice, noticeAssessment } =
      await createTwoTargetFixture()
    const [heldTarget, otherTarget] = aggregate.targets
    const artifact = await appendCopyrightEvidenceArtifact({
      submissionId: aggregate.submissions[0].id,
      storageKey: `copyright-inbound/${crypto.randomUUID()}.eml`,
      sha256: Buffer.alloc(32, 7),
      mimeType: 'message/rfc822',
      byteSize: 42,
    })
    const restrictions = await Promise.all(
      [heldTarget, otherTarget].map(target =>
        acceptCopyrightNoticeAndImposeRestriction({
          noticeId: notice.id,
          targetId: target.id,
          assessmentId: noticeAssessment.id,
          imposedAt: new Date('2026-07-01T12:00:00.000Z'),
          imposedById: moderator.id,
        }),
      ),
    )
    const counterNotice = await createCopyrightCounterNotice(
      claimant,
      notice.id,
      crypto.randomUUID(),
      {
        name: 'Poster',
        address: '1 Main Street',
        telephone: '555-0100',
        consentToFederalJurisdiction: true,
        consentToServiceOfProcess: true,
        goodFaithMisidentificationUnderPenaltyOfPerjury: true,
        electronicSignature: 'Poster',
        targetIds: [heldTarget.id, otherTarget.id],
      },
    )
    const counterAssessment = await appendCopyrightSubmissionAssessment({
      submissionId: counterNotice.submission.id,
      assessedAt: new Date('2026-07-01T12:00:00.000Z'),
      currentUser: moderator,
      substantiallyCompliant: true,
      targetIds: [heldTarget.id, otherTarget.id],
    })
    const deadline = await createCounterNoticeDeadline({ assessmentId: counterAssessment.id })
    const restorationNow = new Date(deadline.earliest_restoration_at.getTime() + 86_400_000)
    const holdSubmission = await appendCopyrightNoticeSubmission({
      noticeId: notice.id,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date('2026-07-01T12:00:00.000Z'),
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `hold-${crypto.randomUUID()}`,
    })
    const hold = await appendCopyrightLegalHoldAssessment({
      currentUser: moderator,
      submissionId: holdSubmission.id,
      assessedAt: new Date('2026-07-01T12:01:00.000Z'),
      fromOriginalClaimant: true,
      proceedingKind: 'ccb',
      ccbClaimKind: 'claim',
      commencedAt: new Date('2026-07-01T12:00:00.000Z'),
      receivedByDesignatedAgentAt: new Date('2026-07-01T12:00:00.000Z'),
      sameMaterial: true,
      targetIds: [heldTarget.id],
      rationale: 'Verified qualifying CCB filing.',
    })
    await expect(
      createEligibleCopyrightRestoreIntent({
        noticeId: notice.id,
        targetId: heldTarget.id,
        restrictionId: restrictions[0].id,
        deadlineId: deadline.id,
        expectedPlacementRevision: heldTarget.placement_revision,
        now: restorationNow,
      }),
    ).rejects.toThrow('Copyright restoration is not eligible')
    const intent = await createEligibleCopyrightRestoreIntent({
      noticeId: notice.id,
      targetId: otherTarget.id,
      restrictionId: restrictions[1].id,
      deadlineId: deadline.id,
      expectedPlacementRevision: otherTarget.placement_revision,
      now: restorationNow,
    })
    const resolution = await resolveCopyrightLegalHold({
      currentUser: moderator,
      assessmentId: hold.id,
      resolvedAt: new Date(restorationNow.getTime() + 60_000),
      resolutionKind: 'dismissed',
      rationale: `resolution-${crypto.randomUUID()}`,
    })
    const heldIntent = await createEligibleCopyrightRestoreIntent({
      noticeId: notice.id,
      targetId: heldTarget.id,
      restrictionId: restrictions[0].id,
      deadlineId: deadline.id,
      expectedPlacementRevision: heldTarget.placement_revision,
      now: new Date(restorationNow.getTime() + 120_000),
    })
    const refreshed = await getCopyrightNoticePrivateAggregate(notice.id)

    expect(intent.action).toBe('restore')
    expect(heldIntent.action).toBe('restore')
    expect(resolution.copyright_notice_legal_hold_assessment_id).toBe(hold.id)
    expect(hold.target_ids).toEqual([heldTarget.id])
    expect(refreshed?.evidenceArtifacts).toContainEqual(
      expect.objectContaining({ id: artifact.id, byte_size: 42 }),
    )
    expect(refreshed?.holdAssessments).toContainEqual(
      expect.objectContaining({ id: hold.id, target_ids: [heldTarget.id] }),
    )
  })
})
