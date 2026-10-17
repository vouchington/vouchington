import { DELETED_USER_ID } from '@services/users/constants'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { createDeterministicCopyrightCorrespondencesInTransaction } from './correspondence.mts'
import {
  createCopyrightDeliveryIntents,
  type CopyrightDeliveryIntentInput,
} from './delivery-intent-batch.mts'
import type { CopyrightNoticeDeliveryKind } from './delivery-types.mts'
import type { CopyrightCorrespondenceKind } from './types.mts'

export type CopyrightStatementDeliveryInput = {
  noticeId: string
  recipientUserId: string | null
  recipientRole: 'poster' | 'claimant' | 'informed_owner'
  recipientEmail?: string | null
  deliveryKind: CopyrightNoticeDeliveryKind
  correspondenceKind: CopyrightCorrespondenceKind
  key: string
  text: string
  targetPath?: string
}

export function createCopyrightStatementDeliveryInTransaction(
  input: CopyrightStatementDeliveryInput,
  transaction: TransactionQuery,
): Promise<void> {
  return createCopyrightStatementDeliveriesInTransaction([input], transaction)
}

/**
 * Check stable event identity before creating immutable correspondence, so replays reuse it. Every
 * recipient's identity check, lifecycle lock, account check, correspondence and intents run as one
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
  const activeAccountIds = await lockActiveRecipientAccounts(accountIds, transaction)
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
async function lockActiveRecipientAccounts(
  accountIds: readonly string[],
  transaction: TransactionQuery,
): Promise<Set<string>> {
  if (accountIds.length === 0) return new Set()
  // Legal rows may already be locked; waiting would invert user-deletion lock order.
  // Shared readers allow parallel legal writes; deletion owns this key exclusively.
  // An exclusive lifecycle transition aborts this atomic operation with 409 for retry.
  const { rows: locks } = await transaction<{
    all_locked: boolean
  }>(sql`/* createCopyrightStatementDeliveriesInTransaction:recipientLifecycleLock */
    SELECT COALESCE(bool_and(lock_taken.locked), true) AS all_locked
    FROM (
      SELECT pg_try_advisory_xact_lock_shared(hashtextextended(account_id, 0)) AS locked
      FROM unnest(${accountIds}::text[]) AS account(account_id)
    ) lock_taken
  `)
  assert(locks[0]?.all_locked, 409, 'Recipient account lifecycle transition is in progress')
  const { rows: accounts } = await transaction<{
    id: string
  }>(sql`/* createCopyrightStatementDeliveriesInTransaction:activeRecipient */
    SELECT id FROM users WHERE id = ANY(${accountIds}::uuid[]) AND deleted_at IS NULL
  `)
  return new Set(accounts.map(account => account.id))
}
