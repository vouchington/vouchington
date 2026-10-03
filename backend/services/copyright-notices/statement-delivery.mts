import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { createDeterministicCopyrightCorrespondenceInTransaction } from './correspondence.mts'
import { createCopyrightDeliveryIntent } from './delivery-intents.mts'
import type { CopyrightNoticeDeliveryKind } from './delivery-types.mts'
import type { CopyrightCorrespondenceKind } from './types.mts'

/** Check stable event identity before creating immutable correspondence, so replays reuse it. */
export async function createCopyrightStatementDeliveryInTransaction(
  input: {
    noticeId: string
    recipientUserId: string | null
    recipientRole: 'poster' | 'claimant'
    recipientEmail?: string | null
    deliveryKind: CopyrightNoticeDeliveryKind
    correspondenceKind: CopyrightCorrespondenceKind
    key: string
    text: string
  },
  transaction: TransactionQuery,
): Promise<void> {
  const { rows } = await transaction<{
    idempotency_key: string
  }>(sql`/* createCopyrightStatementDeliveryInTransaction:existing */
    SELECT idempotency_key FROM copyright_notice_delivery_intents
    WHERE idempotency_key IN (${input.key}, ${`${input.key}:email`})
  `)
  if (rows.length) return
  const correspondence = await createDeterministicCopyrightCorrespondenceInTransaction(
    {
      noticeId: input.noticeId,
      submissionId: null,
      correspondenceKind: input.correspondenceKind,
      bodyText: input.text,
    },
    transaction,
  )
  if (input.recipientUserId)
    await createCopyrightDeliveryIntent(
      {
        noticeId: input.noticeId,
        submissionId: null,
        correspondenceId: correspondence.id,
        recipientUserId: input.recipientUserId,
        recipientRole: input.recipientRole,
        deliveryKind: input.deliveryKind,
        channel: 'in_app',
        idempotencyKey: input.key,
      },
      transaction,
    )
  if (input.recipientRole === 'claimant' && !input.recipientEmail) return
  await createCopyrightDeliveryIntent(
    {
      noticeId: input.noticeId,
      submissionId: null,
      correspondenceId: correspondence.id,
      recipientUserId: input.recipientUserId,
      recipientRole: input.recipientRole,
      deliveryKind: input.deliveryKind,
      channel: 'email',
      idempotencyKey: `${input.key}:email`,
      recipientEmail: input.recipientEmail ?? undefined,
    },
    transaction,
  )
}
