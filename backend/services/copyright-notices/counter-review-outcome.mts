import { advanceCopyrightLastLegalActivityAt } from './last-legal-activity.mts'
import type { OwnedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createCopyrightDeliveryIntent } from './delivery-intents.mts'
import { createEmailSubmitterOutcomeInTransaction } from './submission-review-email-outcome.mts'
import { COPYRIGHT_AI_ASSISTED_SENTENCE } from './statement-of-reasons-wording.mts'

export async function createCopyrightCounterReviewOutcome(
  transaction: OwnedTransaction,
  noticeId: string,
  submissionId: string,
  isAccepted: boolean,
  aiAssisted: boolean,
): Promise<void> {
  const { rows: submitterRows } = await transaction<{ submitted_by_id: string | null }>(
    sql`/* reviewCopyrightCounterNotice:submitter */
        SELECT submitted_by_id FROM copyright_notice_submissions
        WHERE id = ${submissionId}
      `,
  )
  if (submitterRows[0]?.submitted_by_id) {
    await createCopyrightDeliveryIntent(
      {
        noticeId: noticeId,
        submissionId: submissionId,
        correspondenceId: null,
        recipientUserId: submitterRows[0].submitted_by_id,
        recipientRole: 'poster',
        deliveryKind: 'status_update',
        channel: 'in_app',
        idempotencyKey: `copyright-counter-review:${submissionId}:poster-outcome`,
      },
      transaction,
    )
  } else
    await createEmailSubmitterOutcomeInTransaction(
      {
        noticeId: noticeId,
        submissionId: submissionId,
        bodyText:
          (isAccepted
            ? 'Your counter-notice was accepted and forwarded to the original claimant.'
            : 'Your counter-notice was reviewed and was not accepted.') +
          (aiAssisted ? `\n\n${COPYRIGHT_AI_ASSISTED_SENTENCE}` : ''),
        idempotencyKey: `copyright-counter-review:${submissionId}:email-outcome`,
      },
      transaction,
    )
  await advanceCopyrightLastLegalActivityAt(transaction, { noticeId })
}
