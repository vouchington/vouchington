import type { LockedCopyrightActionDelivery } from './action-delivery-locking-types.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
import { beginTransaction } from '@data-stores/psql'
import { CopyrightActionLeaseExpiredError } from './action-delivery-locking.mts'
import sql from 'sql-template-strings'
import { insertCopyrightActionLifecycleEvent } from './action-delivery-state.mts'
import { readCopyrightActionPreparation } from './action-delivery-preparation-facts.mts'

/** The event's notice clock precedes domain writes and disappears with a rejected preparation. */
export async function beginCopyrightRestorePreparation(
  legal: LockedCopyrightActionDelivery,
  intentId: string,
  event: 'restoration_unavailable' | 'restoration_authorized_pending_delivery',
  query: TransactionQuery,
): Promise<LockedCopyrightActionDelivery | null> {
  await insertTentativeCopyrightRestorationEvent(legal, intentId, event, query)
  const refreshed = await readCopyrightActionPreparation(intentId, legal.lease_token, query)
  if (!refreshed) return null
  return refreshed
}

async function insertTentativeCopyrightRestorationEvent(
  legal: LockedCopyrightActionDelivery,
  intentId: string,
  event: 'restoration_unavailable' | 'restoration_authorized_pending_delivery',
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* prepareCopyrightAction:savepoint */ SAVEPOINT copyright_restore_preparation`)
  await insertCopyrightActionLifecycleEvent(legal, intentId, event, query)
}

export async function rollbackCopyrightRestorePreparation(query: TransactionQuery): Promise<void> {
  await query(
    sql`/* prepareCopyrightAction:rollback */ ROLLBACK TO SAVEPOINT copyright_restore_preparation`,
  )
}

export async function commitCopyrightPreparationOutcome<
  Outcome extends 'stale' | 'blocked' | 'not_claimed' | 'applied',
>(transaction: Awaited<ReturnType<typeof beginTransaction>>, outcome: Outcome): Promise<Outcome> {
  await transaction.commit()
  return outcome
}

/** Only a CAS miss from this resource is ownership loss; nested receipt failures propagate. */
export async function withCopyrightPreparationTransaction<Result>(
  operation: (transaction: Awaited<ReturnType<typeof beginTransaction>>) => Promise<Result>,
): Promise<Result | 'not_claimed'> {
  let owned: TransactionQuery | undefined
  try {
    await using transaction = await beginTransaction()
    owned = transaction
    return await operation(transaction)
  } catch (err) {
    if (err instanceof CopyrightActionLeaseExpiredError && err.belongsTo(owned))
      return 'not_claimed' as const
    throw err
  }
}
