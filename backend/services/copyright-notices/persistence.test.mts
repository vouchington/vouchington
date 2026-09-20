import { describe, expect, it } from 'vitest'
import { insertTestImage } from '@voucha/test-helpers/entities/images'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightNoticeSubmission,
  appendCopyrightSubmissionAssessment,
  approveCopyrightCorrespondence,
  completeCopyrightMandatoryHumanReview,
  createCopyrightNoticeAggregate,
  createCounterNoticeDeadline,
  createEligibleCopyrightRestoreIntent,
  createOutboundCopyrightCorrespondence,
  getCopyrightNoticePrivateAggregate,
} from './index.mts'

async function createFixture() {
  const [claimant, moderatorRecord] = await Promise.all([
    createTestUserDirect(),
    createTestUserDirect(),
  ])
  const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
  const imageId = await insertTestImage(claimant.id)
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date('2026-06-30T16:00:00.000Z'),
    claimantUserId: claimant.id,
    claimantDisplayName: 'private snapshot',
    claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
    workDescription: `work-${crypto.randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'signed_in_form',
      bodyCiphertext: `notice-${crypto.randomUUID()}`,
    },
    targets: [
      {
        placementKey: `post-image:${crypto.randomUUID()}`,
        placementRevision: 1,
        imageId,
        hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
      },
    ],
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  if (!aggregate) throw new Error('fixture notice disappeared')
  const noticeAssessment = await appendCopyrightSubmissionAssessment({
    submissionId: aggregate.submissions[0].id,
    assessedAt: new Date('2026-07-01T11:00:00.000Z'),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  return { aggregate, claimant, moderator, notice, noticeAssessment }
}
describe('copyright notice persistence', () => {
  it('creates an immutable notice aggregate transactionally', async () => {
    const { aggregate, notice } = await createFixture()

    expect(aggregate.notice.id).toBe(notice.id)
    expect(aggregate.targets).toHaveLength(1)
    expect(aggregate.lifecycleEvents.map(event => event.event_type)).toContain('notice_received')
  })
  it('derives a deadline from the immutable qualifying counter-notice receipt', async () => {
    const { aggregate, moderator, notice } = await createFixture()
    const submission = await appendCopyrightNoticeSubmission({
      noticeId: notice.id,
      kind: 'counter_notice',
      receivedAt: new Date('2026-06-30T16:00:00.000Z'),
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `counter-${crypto.randomUUID()}`,
    })
    const assessment = await appendCopyrightSubmissionAssessment({
      submissionId: submission.id,
      assessedAt: new Date('2026-07-04T16:00:00.000Z'),
      currentUser: moderator,
      substantiallyCompliant: true,
      targetIds: [aggregate.targets[0].id],
    })
    const deadline = await createCounterNoticeDeadline({ assessmentId: assessment.id })

    expect(deadline.earliest_restoration_at.toISOString()).toBe('2026-07-15T04:00:00.000Z')
    expect(deadline.escalation_at.toISOString()).toBe('2026-07-21T04:00:00.000Z')
    expect(deadline.restoration_deadline_at.toISOString()).toBe('2026-07-22T04:00:00.000Z')
  })
  it('requires a reviewer for email and guest-form compliance assessments', async () => {
    const { notice } = await createFixture()
    const submission = await appendCopyrightNoticeSubmission({
      noticeId: notice.id,
      kind: 'notice',
      receivedAt: new Date('2026-07-01T12:00:00.000Z'),
      sourceKind: 'guest_form',
      submittedByUserId: null,
      bodyCiphertext: `guest-${crypto.randomUUID()}`,
    })

    await expect(
      appendCopyrightSubmissionAssessment({
        submissionId: submission.id,
        assessedAt: new Date('2026-07-01T12:01:00.000Z'),
        currentUser: null,
        substantiallyCompliant: true,
      }),
    ).rejects.toThrow('Email and guest-form assessments require a copyright reviewer')
  })
  it('requires human review on the specific restriction before a restoration intent', async () => {
    const { aggregate, moderator, notice, noticeAssessment } = await createFixture()
    const target = aggregate.targets[0]
    const restriction = await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: noticeAssessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      imposedById: null,
    })
    const submission = await appendCopyrightNoticeSubmission({
      noticeId: notice.id,
      kind: 'counter_notice',
      receivedAt: new Date('2026-06-30T16:00:00.000Z'),
      sourceKind: 'signed_in_form',
      submittedByUserId: null,
      bodyCiphertext: `counter-${crypto.randomUUID()}`,
    })
    const assessment = await appendCopyrightSubmissionAssessment({
      submissionId: submission.id,
      assessedAt: new Date('2026-07-01T12:00:00.000Z'),
      currentUser: moderator,
      substantiallyCompliant: true,
      targetIds: [target.id],
    })
    const deadline = await createCounterNoticeDeadline({ assessmentId: assessment.id })

    await expect(
      createEligibleCopyrightRestoreIntent({
        noticeId: notice.id,
        targetId: target.id,
        restrictionId: restriction.id,
        deadlineId: deadline.id,
        expectedPlacementRevision: target.placement_revision,
        now: new Date('2026-07-16T12:00:00.000Z'),
        blockers: [],
      }),
    ).rejects.toThrow('Copyright restoration is not eligible')
    await completeCopyrightMandatoryHumanReview({
      noticeId: notice.id,
      restrictionId: restriction.id,
      currentUser: moderator,
      action: 'confirm',
      reviewedAt: new Date('2026-07-02T12:00:00.000Z'),
    })
    const intent = await createEligibleCopyrightRestoreIntent({
      noticeId: notice.id,
      targetId: target.id,
      restrictionId: restriction.id,
      deadlineId: deadline.id,
      expectedPlacementRevision: target.placement_revision,
      now: new Date('2026-07-16T12:00:00.000Z'),
      blockers: [],
    })
    expect(intent.action).toBe('restore')
  })
  it('rejects an explicit non-copyright placement blocker before creating a restore intent', async () => {
    const { aggregate, notice } = await createFixture()
    const target = aggregate.targets[0]
    await expect(
      createEligibleCopyrightRestoreIntent({
        noticeId: notice.id,
        targetId: target.id,
        restrictionId: crypto.randomUUID(),
        deadlineId: crypto.randomUUID(),
        expectedPlacementRevision: target.placement_revision,
        now: new Date(),
        blockers: ['deletion'],
      }),
    ).rejects.toThrow('A non-copyright placement blocker prevents restoration')
  })
  it('cancels every prior deadline when a compliance assessment is corrected', async () => {
    const { aggregate, moderator, notice, noticeAssessment } = await createFixture()
    const target = aggregate.targets[0]
    const restriction = await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: noticeAssessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      imposedById: moderator.id,
    })
    const submission = await appendCopyrightNoticeSubmission({
      noticeId: notice.id,
      kind: 'counter_notice',
      receivedAt: new Date('2026-06-30T16:00:00.000Z'),
      sourceKind: 'signed_in_form',
      submittedByUserId: moderator.id,
      bodyCiphertext: `counter-${crypto.randomUUID()}`,
    })
    const firstAssessment = await appendCopyrightSubmissionAssessment({
      submissionId: submission.id,
      assessedAt: new Date('2026-07-01T12:00:00.000Z'),
      currentUser: moderator,
      substantiallyCompliant: true,
      targetIds: [target.id],
    })
    const staleDeadline = await createCounterNoticeDeadline({ assessmentId: firstAssessment.id })
    const correction = await appendCopyrightSubmissionAssessment({
      submissionId: submission.id,
      assessedAt: new Date('2026-07-02T12:00:00.000Z'),
      currentUser: moderator,
      substantiallyCompliant: true,
      targetIds: [target.id],
      supersedesAssessmentId: firstAssessment.id,
    })

    await expect(
      appendCopyrightSubmissionAssessment({
        submissionId: submission.id,
        assessedAt: new Date('2026-07-03T12:00:00.000Z'),
        currentUser: moderator,
        substantiallyCompliant: false,
        targetIds: [target.id],
        supersedesAssessmentId: firstAssessment.id,
      }),
    ).rejects.toThrow('Assessment must extend the current assessment tip')
    const replacementDeadline = await createCounterNoticeDeadline({ assessmentId: correction.id })
    const finalCorrection = await appendCopyrightSubmissionAssessment({
      submissionId: submission.id,
      assessedAt: new Date('2026-07-04T12:00:00.000Z'),
      currentUser: moderator,
      substantiallyCompliant: false,
      supersedesAssessmentId: correction.id,
    })
    await expect(createCounterNoticeDeadline({ assessmentId: correction.id })).rejects.toThrow(
      'Copyright submission assessment not found',
    )
    await completeCopyrightMandatoryHumanReview({
      noticeId: notice.id,
      restrictionId: restriction.id,
      currentUser: moderator,
      action: 'confirm',
      reviewedAt: new Date('2026-07-04T12:01:00.000Z'),
    })
    await expect(
      createEligibleCopyrightRestoreIntent({
        noticeId: notice.id,
        targetId: target.id,
        restrictionId: restriction.id,
        deadlineId: replacementDeadline.id,
        expectedPlacementRevision: target.placement_revision,
        now: new Date('2026-07-16T12:00:00.000Z'),
        blockers: [],
      }),
    ).rejects.toThrow('Copyright notice restoration record not found')
    const refreshedAggregate = await getCopyrightNoticePrivateAggregate(notice.id)

    expect(refreshedAggregate?.deadlines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: staleDeadline.id, cancelled_at: expect.any(Date) }),
        expect.objectContaining({ id: replacementDeadline.id, cancelled_at: expect.any(Date) }),
      ]),
    )
    expect(refreshedAggregate?.assessments).toContainEqual(
      expect.objectContaining({ id: finalCorrection.id, substantially_compliant: false }),
    )
  })

  it('keeps outbound correspondence scoped to its own case and audits approval', async () => {
    const first = await createFixture()
    const second = await createFixture()
    const secondSubmission = second.aggregate.submissions[0]

    await expect(
      createOutboundCopyrightCorrespondence({
        noticeId: first.notice.id,
        submissionId: secondSubmission.id,
        correspondenceKind: 'status_update',
        compositionKind: 'agent',
        bodyCiphertext: `draft-${crypto.randomUUID()}`,
        draftedById: null,
      }),
    ).rejects.toThrow('Copyright notice or case submission not found')

    const draft = await createOutboundCopyrightCorrespondence({
      noticeId: first.notice.id,
      submissionId: first.aggregate.submissions[0].id,
      correspondenceKind: 'status_update',
      compositionKind: 'agent',
      bodyCiphertext: `draft-${crypto.randomUUID()}`,
      draftedById: null,
    })
    await approveCopyrightCorrespondence({
      currentUser: first.moderator,
      correspondenceId: draft.id,
      approvedAt: new Date('2026-07-01T12:00:00.000Z'),
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(first.notice.id)
    expect(aggregate?.lifecycleEvents.map(event => event.event_type)).toEqual(
      expect.arrayContaining(['outbound_correspondence_created', 'agent_correspondence_approved']),
    )
  })
})
