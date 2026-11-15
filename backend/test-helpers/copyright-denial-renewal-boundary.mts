import type { OwnedTransaction, QueryExecutor } from '@data-stores/psql'
import { onTestFinished } from 'vitest'
import {
  reserveTestPostgresObserver,
  createTestPostgresClientLoan,
} from './postgres-client-loan.mts'
import {
  getTestOwnedPostgresLock,
  assertTestOwnedPostgresWait,
} from './postgres-client-lock-identity.mts'

/** Release the filing after either native renewal wait or successful actual lease extension. */
export async function runTestCopyrightRenewalBoundary(
  transaction: OwnedTransaction,
  args: Parameters<QueryExecutor>,
  holderProcessId: number,
  resumeFiling: () => void,
): Promise<Awaited<ReturnType<QueryExecutor>>> {
  const observer = reserveTestPostgresObserver('write')
  let loan: ReturnType<typeof createTestPostgresClientLoan> | undefined
  onTestFinished(async () => {
    await loan?.dispose()
  })
  try {
    const client = await observer.ready
    const lock = await getTestOwnedPostgresLock(client, {
      holderProcessId,
      lock: { kind: 'transaction' },
    })
    loan = createTestPostgresClientLoan(transaction.client, lock)
    const { processId } = await loan.ready
    const pending = Reflect.apply(transaction, undefined, args)
    const settled = Promise.allSettled([pending])
    const boundary = await Promise.race([
      loan.wait(settled).then(() => 'waiting' as const),
      pending.then(() => 'renewed' as const),
    ])
    if (boundary === 'waiting')
      await assertTestOwnedPostgresWait(
        client,
        processId,
        holderProcessId,
        'renewCopyrightActionIntentLease',
      )
    resumeFiling()
    return await pending
  } finally {
    resumeFiling()
    await observer.release(false)
  }
}
