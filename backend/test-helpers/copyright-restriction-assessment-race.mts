import { commitCopyrightWritersInOrder } from './copyright-form-review-assessment-race.mts'
import { completeCopyrightMandatoryHumanReview } from '../services/copyright-notices/human-review.mts'
import { createEligibleCopyrightRestoreIntent } from '../services/copyright-notices/restoration.mts'
import { overlapCopyrightWriters } from './copyright-admission-association-race.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from '../services/copyright-notices/restrictions.mts'
import { appendCopyrightSubmissionAssessment } from '../services/copyright-notices/compliance.mts'

export async function acceptAndSupersedeCopyrightNotice(
  acceptance: Parameters<typeof acceptCopyrightNoticeAndImposeRestriction>[0],
  assessment: Parameters<typeof appendCopyrightSubmissionAssessment>[0],
  first: 'restriction' | 'assessment',
) {
  const accept = async () => {
    try {
      return {
        status: 'fulfilled' as const,
        value: await acceptCopyrightNoticeAndImposeRestriction(acceptance),
      }
    } catch (err) {
      if ((err as { status?: number } | null)?.status !== 422) throw err
      return { status: 'rejected' as const, reason: err }
    }
  }
  const assess = () => appendCopyrightSubmissionAssessment(assessment)
  const ownedIds = [acceptance.noticeId, acceptance.targetId, assessment.submissionId]
  if (first === 'restriction') {
    const [restricted, assessed] = await overlapCopyrightWriters(
      'acceptCopyrightNoticeAndImposeRestriction:lockNotice',
      accept,
      assess,
      ownedIds,
    )
    return { restricted, assessed }
  }
  const [assessed, restricted] = await overlapCopyrightWriters(
    'appendCopyrightSubmissionAssessment',
    assess,
    accept,
    ownedIds,
  )
  return { restricted, assessed }
}

export async function reviewAndRestoreCopyrightRestriction(
  review: Parameters<typeof completeCopyrightMandatoryHumanReview>[0],
  restoration: Parameters<typeof createEligibleCopyrightRestoreIntent>[0],
) {
  const [reviewed, restored] = await commitCopyrightWritersInOrder(
    () => completeCopyrightMandatoryHumanReview(review),
    () => createEligibleCopyrightRestoreIntent(restoration),
    'completeCopyrightMandatoryHumanReview',
    'lockCopyrightNoticeForLegalWrite',
    review.noticeId,
    [review.noticeId, review.restrictionId, restoration.targetId, restoration.deadlineId],
  )
  return { review: reviewed, restoration: restored }
}
