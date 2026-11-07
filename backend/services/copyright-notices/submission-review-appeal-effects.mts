import { beginTransaction } from '@data-stores/psql'
import {
  advanceCopyrightLastLegalActivityAt,
  type LockedCopyrightNotice,
} from './last-legal-activity.mts'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { applyCopyrightAppealDecisions } from './submission-review-appeal-decisions.mts'
import { recordRestrictionAppealReversalEvents } from './claimant-misuse-ledger.mts'
import { createCopyrightRestoreIntentForReversalInTransaction } from './restoration-reversal.mts'
import {
  buildCopyrightReviewOutcomeDeliveries,
  type ReviewOutcomeNoticeInput,
} from './review-outcome-notices.mts'
import { createCopyrightStatementDeliveriesInTransaction } from './statement-delivery.mts'
import { createEmailSubmitterOutcomeInTransaction } from './submission-review-email-outcome.mts'
import { applyCopyrightConfirmationConsequencesInTransaction } from './staydown-registration.mts'
import type { CopyrightHumanReviewAction } from './types.mts'

type AppealReviewEffectInput = {
  submissionId: string
  currentUser: PrivateUser
  recommendationId: string | null
  manualFallbackReason: string | null
  rationale: string
  decisions: Array<{ restrictionId: string; action: CopyrightHumanReviewAction }>
}

export async function recordCopyrightAppealReviewEffects(
  input: AppealReviewEffectInput,
  appeal: { copyright_notice_id: string; submitted_by_id: string | null },
  restrictionRows: Array<{ id: string; human_reviewed_at: Date | null }>,
  lockedNotice: LockedCopyrightNotice,
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<{ reviewIds: string[]; reversalIntentIds: string[]; staydownImageIds: string[] }> {
  const reviewedAt = new Date()
  const reversalRestrictionIds: string[] = []
  const firstReviews: ReviewOutcomeNoticeInput[] = []
  const restrictionsById = new Map(restrictionRows.map(row => [row.id, row]))
  for (const decision of input.decisions) {
    const restriction = restrictionsById.get(decision.restrictionId)
    assert(restriction, 422, 'Copyright restriction not found')
    if (restriction.human_reviewed_at === null) {
      firstReviews.push({
        noticeId: appeal.copyright_notice_id,
        restrictionId: decision.restrictionId,
        action: decision.action,
      })
    }
    if (decision.action === 'reverse') reversalRestrictionIds.push(decision.restrictionId)
  }
  const reviewIds = await applyCopyrightAppealDecisions(transaction, {
    submissionId: input.submissionId,
    reviewerId: input.currentUser.id,
    recommendationId: input.recommendationId,
    manualFallbackReason: input.manualFallbackReason,
    rationale: input.rationale,
    reviewedAt,
    decisions: input.decisions,
  })
  // ast-grep-ignore: no-three-sequential-awaits -- delivery construction must take notice locks before confirmation consequences write incident and staydown rows; record the lifecycle event before completed-outcome deliveries
  const noticeDeliveries = await buildCopyrightReviewOutcomeDeliveries(firstReviews, transaction)
  const staydownImageIds = await applyCopyrightConfirmationConsequencesInTransaction(
    appeal.copyright_notice_id,
    transaction,
  )
  await transaction(sql`/* reviewCopyrightAppeal:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id, copyright_notice_submission_id)
    VALUES (${appeal.copyright_notice_id}, 'appeal_reviewed', ${input.currentUser.id}, ${input.submissionId})
  `)
  await createCopyrightStatementDeliveriesInTransaction(
    noticeDeliveries,
    transaction,
    appeal.submitted_by_id
      ? [
          {
            noticeId: appeal.copyright_notice_id,
            submissionId: input.submissionId,
            correspondenceId: null,
            recipientUserId: appeal.submitted_by_id,
            recipientRole: 'poster',
            deliveryKind: 'status_update',
            channel: 'in_app',
            idempotencyKey: `copyright-appeal-review:${input.submissionId}:poster-outcome`,
          },
        ]
      : [],
  )
  if (!appeal.submitted_by_id)
    await createEmailSubmitterOutcomeInTransaction(
      {
        noticeId: appeal.copyright_notice_id,
        submissionId: input.submissionId,
        bodyText: 'Your appeal has been reviewed. See the copyright case for the recorded outcome.',
        idempotencyKey: `copyright-appeal-review:${input.submissionId}:email-outcome`,
      },
      transaction,
    )
  const reversalIntentIds: string[] = []
  for (const restrictionId of reversalRestrictionIds) {
    // Heterogeneous multi-statement saga per restriction; at most 20 appeal decisions, unique per restriction (submission-reviews.mts:34-39).
    // oxlint-disable-next-line no-await-in-loop -- each placement has a separate durable restore saga.
    const intent = await createCopyrightRestoreIntentForReversalInTransaction(
      restrictionId,
      transaction,
    )
    reversalIntentIds.push(intent.id)
  }
  await recordRestrictionAppealReversalEvents(transaction, {
    noticeId: appeal.copyright_notice_id,
    restrictionIds: reversalRestrictionIds,
    recordedAt: reviewedAt,
  })
  await advanceCopyrightLastLegalActivityAt(transaction, lockedNotice)
  return { reviewIds, reversalIntentIds, staydownImageIds }
}
