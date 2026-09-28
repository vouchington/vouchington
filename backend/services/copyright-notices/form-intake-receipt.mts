import type { TransactionQuery } from '@data-stores/psql/types'
import { createCopyrightDeliveryIntent } from './delivery-intents.mts'
import { createDeterministicCopyrightCorrespondenceInTransaction } from './correspondence.mts'

/** The immutable receipt body must exist before its email delivery obligation can reference it. */
export async function createCopyrightFormReceiptInTransaction(
  input: { noticeId: string; submissionId: string; claimantEmail: string },
  transaction: TransactionQuery,
): Promise<void> {
  const correspondence = await createDeterministicCopyrightCorrespondenceInTransaction(
    {
      noticeId: input.noticeId,
      submissionId: input.submissionId,
      correspondenceKind: 'receipt',
      bodyText: `We received your copyright notice for case ${input.noticeId}. We will review it and contact you if we need more information.`,
    },
    transaction,
  )
  await createCopyrightDeliveryIntent(
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
    transaction,
  )
}
