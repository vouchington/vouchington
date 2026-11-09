import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'

/** Hold a completed default deletion while a competing writer observes its uncommitted rows. */
export async function runTestLandingPageDeleteRace(input: {
  deleteHeld: (query: TransactionQuery) => Promise<void>
  deleteOther: () => Promise<void>
  queryMarker?: string
}): Promise<void> {
  await using holder = await beginTransaction()
  await input.deleteHeld(holder)
  if (input.queryMarker === 'createMyLandingPage') {
    await input.deleteOther()
    await holder.commit()
    return
  }
  const holderProcessId = await getTestPostgresBackendProcessId(holder)
  let releasing: Promise<void> | undefined
  const releaseHolder = () => (releasing ??= Promise.resolve(holder[Symbol.asyncDispose]()))
  await withTestOwnedPostgresWait(
    {
      pool: 'write',
      holderProcessId,
      lock: { kind: 'transaction' },
      queryMarker: input.queryMarker ?? 'deleteMyLandingPage',
      releaseHolder,
    },
    async waitForLock => {
      const action = Promise.resolve().then(input.deleteOther)
      const outcome = Promise.allSettled([action])
      try {
        await waitForLock(action)
        await holder.commit()
      } finally {
        await releaseHolder()
      }
      const [result] = await outcome
      if (!result || result.status === 'rejected')
        throw result?.reason ?? new Error('Missing deletion result')
    },
  )
}
