import { describe, expect, it } from 'vitest'
import { insertTestImage } from '@voucha/test-helpers/entities/images'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightNoticeSubmission,
  appendCopyrightSubmissionAssessment,
  completeCopyrightMandatoryHumanReview,
  createCopyrightNoticeAggregate,
  createCounterNoticeDeadline,
  createEligibleCopyrightRestoreIntent,
  getCopyrightNoticePrivateAggregate,
} from './index.mts'

describe('copyright restriction concurrency', () => {
  it('serializes mandatory review and restoration for one placement', async () => {
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
      claimantDisplayName: null,
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
    const target = aggregate.targets[0]!
    const noticeAssessment = await appendCopyrightSubmissionAssessment({
      submissionId: aggregate.submissions[0]!.id,
      assessedAt: new Date('2026-07-01T11:00:00.000Z'),
      currentUser: null,
      substantiallyCompliant: true,
    })
    const restriction = await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: noticeAssessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      imposedById: null,
    })
    const counterNotice = await appendCopyrightNoticeSubmission({
      noticeId: notice.id,
      kind: 'counter_notice',
      receivedAt: new Date('2026-06-30T16:00:00.000Z'),
      sourceKind: 'signed_in_form',
      submittedByUserId: claimant.id,
      bodyCiphertext: `counter-${crypto.randomUUID()}`,
    })
    const assessment = await appendCopyrightSubmissionAssessment({
      submissionId: counterNotice.id,
      assessedAt: new Date('2026-07-01T12:00:00.000Z'),
      currentUser: moderator,
      substantiallyCompliant: true,
      targetIds: [target.id],
    })
    const deadline = await createCounterNoticeDeadline({ assessmentId: assessment.id })
    const [review, restoration] = await Promise.allSettled([
      completeCopyrightMandatoryHumanReview({
        noticeId: notice.id,
        restrictionId: restriction.id,
        currentUser: moderator,
        action: 'confirm',
        reviewedAt: new Date('2026-07-02T12:00:00.000Z'),
      }),
      createEligibleCopyrightRestoreIntent({
        noticeId: notice.id,
        targetId: target.id,
        restrictionId: restriction.id,
        deadlineId: deadline.id,
        expectedPlacementRevision: target.placement_revision,
        now: new Date('2026-07-16T12:00:00.000Z'),
        blockers: [],
      }),
    ])

    expect(review.status).toBe('fulfilled')
    const restorationOutcome =
      restoration.status === 'fulfilled'
        ? restoration.value.action
        : (restoration.reason as Error).message
    expect(['restore', 'Copyright restoration is not eligible']).toContain(restorationOutcome)
  })
})
