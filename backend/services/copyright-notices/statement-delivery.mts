import { DELETED_USER_ID } from '@services/users/constants'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { createDeterministicCopyrightCorrespondencesInTransaction } from './correspondence.mts'
import { createCopyrightDeliveryIntents } from './delivery-intent-batch.mts'
import type {
  CopyrightDeliveryIntentInput,
  CopyrightNoticeDeliveryKind,
} from './delivery-types.mts'
import type { CopyrightCorrespondenceKind } from './types.mts'

export type CopyrightStatementDeliveryInput = {
  noticeId: string
  /** The hosted use the notice describes; required for restriction and owner notices. */
  targetId?: string
  recipientUserId: string | null
  recipientRole: 'poster' | 'claimant' | 'informed_owner'
  recipientEmail?: string | null
  deliveryKind: CopyrightNoticeDeliveryKind
  correspondenceKind: CopyrightCorrespondenceKind
  key: string
  text: string
  targetPath?: string
}

/**
 * Check stable event identity before creating immutable correspondence, so replays reuse it. Every
 * recipient's identity check, account check, correspondence and intents run as one
 * statement each, however many recipients there are.
 */
export async function createCopyrightStatementDeliveriesInTransaction(
  inputs: readonly CopyrightStatementDeliveryInput[],
  transaction: TransactionQuery,
  additionalIntents: readonly CopyrightDeliveryIntentInput[] = [],
): Promise<void> {
  // A repeated key is one delivery: the first input wins, as a sequential replay would find it.
  const candidates = new Map<string, CopyrightStatementDeliveryInput>()
  for (const input of inputs) {
    const hasRecipient =
      input.recipientRole === 'claimant' ||
      (input.recipientUserId && input.recipientUserId !== DELETED_USER_ID)
    if (hasRecipient && !candidates.has(input.key)) candidates.set(input.key, input)
  }
  if (candidates.size === 0) {
    await createCopyrightDeliveryIntents(additionalIntents, transaction)
    return
  }
  const { rows: existing } = await transaction<{
    idempotency_key: string
  }>(sql`/* createCopyrightStatementDeliveriesInTransaction:existing */
    SELECT idempotency_key FROM copyright_notice_delivery_work_items
    WHERE idempotency_key = ANY(${[...candidates.keys()].flatMap(key => [key, `${key}:email`])}::text[])
  `)
  const existingKeys = new Set(existing.map(row => row.idempotency_key))
  const pending = [...candidates.values()].filter(
    input => !existingKeys.has(input.key) && !existingKeys.has(`${input.key}:email`),
  )
  const accountIds = [
    ...new Set(
      pending.flatMap(input =>
        input.recipientUserId && input.recipientUserId !== DELETED_USER_ID
          ? [input.recipientUserId]
          : [],
      ),
    ),
  ]
  const activeAccountIds = await readActiveRecipientAccounts(accountIds, transaction)
  const deliveries = pending.flatMap(input => {
    const activeUserId =
      input.recipientUserId && activeAccountIds.has(input.recipientUserId)
        ? input.recipientUserId
        : null
    return input.recipientRole !== 'claimant' && !activeUserId ? [] : [{ input, activeUserId }]
  })
  const correspondences = await createDeterministicCopyrightCorrespondencesInTransaction(
    deliveries.map(({ input }) => ({
      noticeId: input.noticeId,
      submissionId: null,
      correspondenceKind: input.correspondenceKind,
      bodyText: input.text,
    })),
    transaction,
  )
  const intents: CopyrightDeliveryIntentInput[] = []
  for (const [index, { input, activeUserId }] of deliveries.entries()) {
    const base = {
      noticeId: input.noticeId,
      targetId: input.targetId,
      submissionId: null,
      correspondenceId: correspondences[index]!.id,
      recipientUserId: activeUserId,
      recipientRole: input.recipientRole,
      deliveryKind: input.deliveryKind,
      targetPath: input.targetPath,
    }
    if (activeUserId) intents.push({ ...base, channel: 'in_app', idempotencyKey: input.key })
    if (input.recipientRole === 'claimant' && !input.recipientEmail) continue
    intents.push({
      ...base,
      channel: 'email',
      idempotencyKey: `${input.key}:email`,
      recipientEmail: input.recipientEmail ?? undefined,
    })
  }
  await createCopyrightDeliveryIntents([...intents, ...additionalIntents], transaction)
}

/** Returns the accounts that are still live. Others lose their in-app delivery. */
async function readActiveRecipientAccounts(
  accountIds: readonly string[],
  transaction: TransactionQuery,
): Promise<Set<string>> {
  if (accountIds.length === 0) return new Set()
  const { rows: accounts } = await transaction<{
    id: string
  }>(sql`/* createCopyrightStatementDeliveriesInTransaction:activeRecipient */
    SELECT id FROM users WHERE id = ANY(${accountIds}::uuid[]) AND deleted_at IS NULL
  `)
  return new Set(accounts.map(account => account.id))
}
