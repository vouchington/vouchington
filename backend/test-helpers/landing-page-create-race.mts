import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'

/** Commit a first real page only after another creator reaches its written capacity state. */
export async function runTestLandingPageFirstCreateRace<Result>(input: {
  createHeld: (query: TransactionQuery) => Promise<Result>
  createOther: () => Promise<Result>
}): Promise<{ held: Result; other: Result }> {
  await using holder = await beginTransaction()
  const held = await input.createHeld(holder)
  const holderProcessId = await getTestPostgresBackendProcessId(holder)
  let releasing: Promise<void> | undefined
  const releaseHolder = () => (releasing ??= Promise.resolve(holder[Symbol.asyncDispose]()))
  const other = await withTestOwnedPostgresWait(
    {
      pool: 'write',
      holderProcessId,
      lock: { kind: 'transaction' },
      queryMarker: 'createMyLandingPage',
      releaseHolder,
    },
    async waitForLock => {
      const action = Promise.resolve().then(input.createOther)
      const outcome = Promise.allSettled([action])
      try {
        await waitForLock(action)
        await holder.commit()
      } finally {
        await releaseHolder()
      }
      const [result] = await outcome
      if (!result || result.status === 'rejected')
        throw result?.reason ?? new Error('Missing create result')
      return result.value
    },
  )
  return { held, other }
}
