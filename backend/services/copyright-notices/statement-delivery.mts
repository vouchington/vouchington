import { DELETED_USER_ID } from '@services/users/constants'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { createDeterministicCopyrightCorrespondenceInTransaction } from './correspondence.mts'
import { createCopyrightDeliveryIntent } from './delivery-intents.mts'
import type { CopyrightNoticeDeliveryKind } from './delivery-types.mts'
import type { CopyrightCorrespondenceKind } from './types.mts'

/** Check stable event identity before creating immutable correspondence, so replays reuse it. */
export async function createCopyrightStatementDeliveryInTransaction(
  input: {
    noticeId: string
    recipientUserId: string | null
    recipientRole: 'poster' | 'claimant' | 'informed_owner'
    recipientEmail?: string | null
    deliveryKind: CopyrightNoticeDeliveryKind
    correspondenceKind: CopyrightCorrespondenceKind
    key: string
    text: string
    targetPath?: string
  },
  transaction: TransactionQuery,
): Promise<void> {
  const { rows } = await transaction<{
    idempotency_key: string
  }>(sql`/* createCopyrightStatementDeliveryInTransaction:existing */
    SELECT idempotency_key FROM copyright_notice_delivery_work_items
    WHERE idempotency_key IN (${input.key}, ${`${input.key}:email`})
  `)
  if (rows.length) return
  let activeRecipientUserId = input.recipientUserId
  if (activeRecipientUserId === DELETED_USER_ID) activeRecipientUserId = null
  if (activeRecipientUserId) {
    // Legal rows may already be locked; waiting would invert user-deletion lock order.
    // Shared readers allow parallel legal writes; deletion owns this key exclusively.
    // An exclusive lifecycle transition aborts this atomic operation with409 for retry.
    const { rows: locks } = await transaction<{
      locked: boolean
    }>(sql`/* createCopyrightStatementDeliveryInTransaction:recipientLifecycleLock */
      SELECT pg_try_advisory_xact_lock_shared(hashtextextended(${activeRecipientUserId}, 0)) AS locked
    `)
    assert(locks[0]?.locked, 409, 'Recipient account lifecycle transition is in progress')
    const { rows: accounts } = await transaction<{
      active: boolean
    }>(sql`/* createCopyrightStatementDeliveryInTransaction:activeRecipient */
      SELECT EXISTS (SELECT 1 FROM users WHERE id = ${activeRecipientUserId} AND deleted_at IS NULL) AS active
    `)
    if (!accounts[0]?.active) activeRecipientUserId = null
  }
  if (input.recipientRole !== 'claimant' && !activeRecipientUserId) return
  const correspondence = await createDeterministicCopyrightCorrespondenceInTransaction(
    {
      noticeId: input.noticeId,
      submissionId: null,
      correspondenceKind: input.correspondenceKind,
      bodyText: input.text,
    },
    transaction,
  )
  if (activeRecipientUserId)
    await createCopyrightDeliveryIntent(
      {
        noticeId: input.noticeId,
        submissionId: null,
        correspondenceId: correspondence.id,
        recipientUserId: activeRecipientUserId,
        recipientRole: input.recipientRole,
        deliveryKind: input.deliveryKind,
        channel: 'in_app',
        idempotencyKey: input.key,
        targetPath: input.targetPath,
      },
      transaction,
    )
  if (input.recipientRole === 'claimant' && !input.recipientEmail) return
  await createCopyrightDeliveryIntent(
    {
      noticeId: input.noticeId,
      submissionId: null,
      correspondenceId: correspondence.id,
      recipientUserId: activeRecipientUserId,
      recipientRole: input.recipientRole,
      deliveryKind: input.deliveryKind,
      channel: 'email',
      idempotencyKey: `${input.key}:email`,
      targetPath: input.targetPath,
      recipientEmail: input.recipientEmail ?? undefined,
    },
    transaction,
  )
}
