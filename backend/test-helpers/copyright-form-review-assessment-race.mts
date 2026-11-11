import { overlapCopyrightWriters } from './copyright-admission-association-race.mts'
import { reviewCopyrightFormIntake } from '../services/copyright-notices/form-reviews.mts'
import { appendCopyrightSubmissionAssessment } from '../services/copyright-notices/compliance.mts'

export async function reviewFormAndAssessCopyrightSubmission(
  review: Parameters<typeof reviewCopyrightFormIntake>[0],
  assessment: Parameters<typeof appendCopyrightSubmissionAssessment>[0],
  noticeId: string,
  first: 'review' | 'assessment',
) {
  const reviewOperation = () => reviewCopyrightFormIntake(review)
  const assessmentOperation = () => appendCopyrightSubmissionAssessment(assessment)
  const ownedIds = [noticeId, review.intakeId, assessment.submissionId]
  if (first === 'review') {
    const [reviewed, assessed] = await overlapCopyrightWriters(
      'reviewCopyrightFormIntake:review',
      reviewOperation,
      assessmentOperation,
      ownedIds,
    )
    return { reviewed, assessed }
  }
  const [assessed, reviewed] = await overlapCopyrightWriters(
    'appendCopyrightSubmissionAssessment:event',
    assessmentOperation,
    reviewOperation,
    ownedIds,
  )
  return { reviewed, assessed }
}
