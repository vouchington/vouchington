import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createCopyrightClaimantDecisionNoticeInTransaction } from '../services/copyright-notices/claimant-decision-notices.mts'
import { reverseAutomatedCopyrightRestrictionsInTransaction } from '../services/copyright-notices/form-reviews-reversal.mts'
import type { createErasedReviewScene } from './copyright-erased-review-scenes.mts'

/** Both producer commit stages are complete before independent retired-history recovery readers. */
export async function seedCommittedErasedRecovery(
  scene: Awaited<ReturnType<typeof createErasedReviewScene>>,
) {
  const noticeId = scene.notice.intake.copyright_notice_id
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    reviewed_at: Date
    reviewed_by_id: string | null
  }>(sql`/* seedCommittedErasedRecovery:review */
    SELECT reviewed_at, reviewed_by_id FROM copyright_notice_form_intake_reviews
    WHERE copyright_notice_form_intake_id = ${scene.notice.intake.id} AND NOT is_accepted`)
  const review = rows[0]
  if (!review || review.reviewed_by_id !== null)
    throw new Error('Owned recovery review actor was not erased')
  await createCopyrightClaimantDecisionNoticeInTransaction(
    { noticeId, event: 'not_accepted' },
    transaction,
  )
  await transaction.commit()
  await using reversal = await beginTransaction()
  await reverseAutomatedCopyrightRestrictionsInTransaction(reversal, {
    noticeId,
    submissionId: scene.notice.intake.copyright_notice_submission_id,
    moderatorId: null,
    reviewedAt: review.reviewed_at,
  })
  await reversal.commit()
}
