import type { TransactionQuery } from '@data-stores/psql/types'
import { createDeterministicCopyrightCorrespondenceInTransaction } from './correspondence.mts'
import { createCopyrightDeliveryIntents } from './delivery-intent-batch.mts'
import { copyrightEuReceiptText } from './statement-of-reasons-wording.mts'

/** Store the EU receipt and both delivery obligations with the filing transaction. */
export async function createEuCopyrightReceiptDelivery(
  input: { noticeId: string; notifierEmail: string; requesterUserId: string | null },
  transaction: TransactionQuery,
): Promise<void> {
  const correspondence = await createDeterministicCopyrightCorrespondenceInTransaction(
    {
      noticeId: input.noticeId,
      submissionId: null,
      correspondenceKind: 'receipt',
      bodyText: copyrightEuReceiptText(input.noticeId, input.requesterUserId !== null),
    },
    transaction,
  )
  const receipt = {
    noticeId: input.noticeId,
    submissionId: null,
    recipientUserId: input.requesterUserId,
    recipientRole: 'claimant' as const,
    deliveryKind: 'claimant_receipt' as const,
  }
  await createCopyrightDeliveryIntents(
    [
      {
        ...receipt,
        correspondenceId: correspondence.id,
        channel: 'email',
        idempotencyKey: `copyright-notice:${input.noticeId}:claimant-email-receipt`,
        recipientEmail: input.notifierEmail,
      },
      ...(input.requesterUserId
        ? [
            {
              ...receipt,
              correspondenceId: correspondence.id,
              channel: 'in_app' as const,
              idempotencyKey: `copyright-notice:${input.noticeId}:claimant-in-app-receipt`,
            },
          ]
        : []),
    ],
    transaction,
  )
}
