import type { TransactionQuery } from '@data-stores/psql/types'
import { createDeterministicCopyrightCorrespondenceInTransaction } from './correspondence.mts'
import { createCopyrightDeliveryIntent } from './delivery-intents.mts'
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
      bodyText: copyrightEuReceiptText(input.noticeId),
    },
    transaction,
  )
  await createCopyrightDeliveryIntent(
    {
      noticeId: input.noticeId,
      submissionId: null,
      correspondenceId: correspondence.id,
      recipientUserId: input.requesterUserId,
      recipientRole: 'claimant',
      deliveryKind: 'claimant_receipt',
      channel: 'email',
      idempotencyKey: `copyright-notice:${input.noticeId}:claimant-email-receipt`,
      recipientEmail: input.notifierEmail,
    },
    transaction,
  )
  if (input.requesterUserId)
    await createCopyrightDeliveryIntent(
      {
        noticeId: input.noticeId,
        submissionId: null,
        correspondenceId: correspondence.id,
        recipientUserId: input.requesterUserId,
        recipientRole: 'claimant',
        deliveryKind: 'claimant_receipt',
        channel: 'in_app',
        idempotencyKey: `copyright-notice:${input.noticeId}:claimant-in-app-receipt`,
      },
      transaction,
    )
}
