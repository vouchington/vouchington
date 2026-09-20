import { describe, expect, it } from 'vitest'
import { insertTestImage } from '@voucha/test-helpers/entities/images'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightEvidenceArtifact,
  appendCopyrightLegalHoldAssessment,
  appendCopyrightNoticeSubmission,
  appendCopyrightSubmissionAssessment,
  completeCopyrightMandatoryHumanReview,
  createCopyrightNoticeAggregate,
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
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date('2026-06-30T16:00:00.000Z'),
    claimantUserId: claimant.id,
    claimantDisplayName: null,
    claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
    workDescription: `work-${crypto.randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: { kind: 'notice', sourceKind: 'signed_in_form', bodyCiphertext: 'notice' },
    targets: imageIds.map((imageId, index) => ({
      placementKey: `post-image:${crypto.randomUUID()}`,
      placementRevision: index + 1,
      imageId,
      hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
    })),
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  if (!aggregate) throw new Error('fixture notice disappeared')
  const noticeAssessment = await appendCopyrightSubmissionAssessment({
    submissionId: aggregate.submissions[0].id,
    assessedAt: new Date('2026-07-01T11:00:00.000Z'),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  return { aggregate, moderator, notice, noticeAssessment }
}

describe('copyright notice evidence and holds', () => {
  it('retains evidence and scopes a qualifying hold to only its identified target', async () => {
    const { aggregate, moderator, notice, noticeAssessment } = await createTwoTargetFixture()
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
    const counterNotice = await appendCopyrightNoticeSubmission({
      noticeId: notice.id,
      kind: 'counter_notice',
      receivedAt: new Date('2026-06-30T16:00:00.000Z'),
      sourceKind: 'signed_in_form',
      submittedByUserId: null,
      bodyCiphertext: `counter-${crypto.randomUUID()}`,
    })
    const counterAssessment = await appendCopyrightSubmissionAssessment({
      submissionId: counterNotice.id,
      assessedAt: new Date('2026-07-01T12:00:00.000Z'),
      currentUser: moderator,
      substantiallyCompliant: true,
      targetIds: [heldTarget.id, otherTarget.id],
    })
    const deadline = await createCounterNoticeDeadline({ assessmentId: counterAssessment.id })
    await Promise.all(
      restrictions.map(restriction =>
        completeCopyrightMandatoryHumanReview({
          noticeId: notice.id,
          restrictionId: restriction.id,
          currentUser: moderator,
          action: 'confirm',
          reviewedAt: new Date('2026-07-02T12:00:00.000Z'),
        }),
      ),
    )
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
    })
    await expect(
      createEligibleCopyrightRestoreIntent({
        noticeId: notice.id,
        targetId: heldTarget.id,
        restrictionId: restrictions[0].id,
        deadlineId: deadline.id,
        expectedPlacementRevision: heldTarget.placement_revision,
        now: new Date('2026-07-16T12:00:00.000Z'),
        blockers: [],
      }),
    ).rejects.toThrow('Copyright restoration is not eligible')
    const intent = await createEligibleCopyrightRestoreIntent({
      noticeId: notice.id,
      targetId: otherTarget.id,
      restrictionId: restrictions[1].id,
      deadlineId: deadline.id,
      expectedPlacementRevision: otherTarget.placement_revision,
      now: new Date('2026-07-16T12:00:00.000Z'),
      blockers: [],
    })
    const resolution = await resolveCopyrightLegalHold({
      currentUser: moderator,
      assessmentId: hold.id,
      resolvedAt: new Date('2026-07-16T12:01:00.000Z'),
      resolutionKind: 'dismissed',
      rationaleCiphertext: `resolution-${crypto.randomUUID()}`,
    })
    const heldIntent = await createEligibleCopyrightRestoreIntent({
      noticeId: notice.id,
      targetId: heldTarget.id,
      restrictionId: restrictions[0].id,
      deadlineId: deadline.id,
      expectedPlacementRevision: heldTarget.placement_revision,
      now: new Date('2026-07-16T12:02:00.000Z'),
      blockers: [],
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
