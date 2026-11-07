import { beginTransaction } from '@data-stores/psql'
import {
  advanceCopyrightLastLegalActivityAt,
  type LockedCopyrightNotice,
} from './last-legal-activity.mts'
import { encryptSecret } from '@modules/token-secrets'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { recordClaimantMisuseEvent } from './claimant-misuse-ledger.mts'
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
  const reviewIds: string[] = []
  const reversalRestrictionIds: string[] = []
  const firstReviews: ReviewOutcomeNoticeInput[] = []
  const restrictionsById = new Map(restrictionRows.map(row => [row.id, row]))
  const reviewerId = input.currentUser.id
  for (const decision of input.decisions) {
    const restriction = restrictionsById.get(decision.restrictionId)
    assert(restriction, 422, 'Copyright restriction not found')
    // oxlint-disable-next-line no-await-in-loop -- one transaction client preserves target decision order.
    await transaction(sql`/* reviewCopyrightAppeal:apply */
      UPDATE copyright_restrictions
      SET human_reviewed_at = COALESCE(human_reviewed_at, ${reviewedAt}),
        human_review_action = COALESCE(human_review_action, ${decision.action}),
        human_reviewed_by_id = CASE WHEN human_reviewed_at IS NULL THEN ${reviewerId} ELSE human_reviewed_by_id END
      WHERE id = ${decision.restrictionId}
    `)
    // oxlint-disable-next-line no-await-in-loop -- the immutable review follows its restriction mutation.
    const { rows } = await transaction<{ id: string }>(sql`/* reviewCopyrightAppeal:record */
      INSERT INTO copyright_notice_appeal_reviews (
        copyright_notice_submission_id, copyright_restriction_id,
        copyright_notice_appeal_recommendation_id, reviewed_at, reviewed_by_id, action,
        rationale_ciphertext, manual_fallback_reason_ciphertext
      ) VALUES (
        ${input.submissionId}, ${decision.restrictionId}, ${input.recommendationId}, ${reviewedAt},
        ${reviewerId}, ${decision.action},
        ${encryptSecret(input.rationale, `copyright-appeal-review:${input.submissionId}:${decision.restrictionId}`)},
        ${input.manualFallbackReason ? encryptSecret(input.manualFallbackReason, `copyright-appeal-review-fallback:${input.submissionId}`) : null}
      ) RETURNING id
    `)
    assert(rows[0], 500, 'Copyright appeal review was not recorded')
    if (restriction.human_reviewed_at === null) {
      firstReviews.push({
        noticeId: appeal.copyright_notice_id,
        restrictionId: decision.restrictionId,
        action: decision.action,
      })
    }
    reviewIds.push(rows[0].id)
    if (decision.action === 'reverse') reversalRestrictionIds.push(decision.restrictionId)
  }
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
    // oxlint-disable-next-line no-await-in-loop -- each placement has a separate durable restore saga.
    const intent = await createCopyrightRestoreIntentForReversalInTransaction(
      restrictionId,
      transaction,
    )
    reversalIntentIds.push(intent.id)
    // oxlint-disable-next-line no-await-in-loop -- the ledger event follows its restriction's saga on one transaction client.
    await recordClaimantMisuseEvent(transaction, {
      noticeId: appeal.copyright_notice_id,
      recordedAt: reviewedAt,
      event: { outcome: 'restriction_reversed_by_appeal', restrictionId },
    })
  }
  await advanceCopyrightLastLegalActivityAt(transaction, lockedNotice)
  return { reviewIds, reversalIntentIds, staydownImageIds }
}
