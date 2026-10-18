import type { TransactionQuery } from '@data-stores/psql/types'
import { copyrightReceiptText } from './statement-of-reasons-wording.mts'
import { createCopyrightDeliveryIntents } from './delivery-intent-batch.mts'
import { createDeterministicCopyrightCorrespondenceInTransaction } from './correspondence.mts'

/**
 * The immutable receipt body must exist before its email delivery obligation can reference it.
 * A signed-in claimant also gets the in-app receipt, created with the email one.
 */
export async function createCopyrightFormReceiptInTransaction(
  input: {
    noticeId: string
    submissionId: string
    claimantEmail: string
    claimantUserId: string | null
  },
  transaction: TransactionQuery,
): Promise<void> {
  const correspondence = await createDeterministicCopyrightCorrespondenceInTransaction(
    {
      noticeId: input.noticeId,
      submissionId: input.submissionId,
      correspondenceKind: 'receipt',
      bodyText: copyrightReceiptText(input.noticeId),
    },
    transaction,
  )
  await createCopyrightDeliveryIntents(
    [
      {
        noticeId: input.noticeId,
        submissionId: input.submissionId,
        correspondenceId: correspondence.id,
        recipientUserId: null,
        recipientRole: 'claimant',
        deliveryKind: 'claimant_receipt',
        channel: 'email',
        idempotencyKey: `copyright-notice:${input.noticeId}:claimant-email-receipt`,
        recipientEmail: input.claimantEmail,
      },
      ...(input.claimantUserId
        ? [
            {
              noticeId: input.noticeId,
              submissionId: input.submissionId,
              correspondenceId: null,
              recipientUserId: input.claimantUserId,
              recipientRole: 'claimant' as const,
              deliveryKind: 'claimant_receipt' as const,
              channel: 'in_app' as const,
              idempotencyKey: `copyright-notice:${input.noticeId}:claimant-in-app-receipt`,
            },
          ]
        : []),
    ],
    transaction,
  )
}
