import type { beginTransaction } from '@data-stores/psql'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import { createTestPostgresMultiWait } from './postgres-multi-client-lock-observer.mts'

/** Bound a skip-locked assertion by the native wait it would otherwise enter. */
export async function finishTestPostgresActionWithoutWaiting<Result>(
  holder: Awaited<ReturnType<typeof beginTransaction>>,
  queryMarker: string,
  action: () => Promise<Result>,
): Promise<Result> {
  const holderProcessId = await getTestPostgresBackendProcessId(holder)
  await using waits = await createTestPostgresMultiWait()
  const observed = await waits.start(
    {
      holderProcessId,
      pool: 'write',
      lock: { kind: 'transaction' },
      queryMarker,
      releaseHolder: () => holder[Symbol.asyncDispose](),
    },
    action,
  )
  return await Promise.race([
    observed.operation,
    observed.waitForLock().then(() => {
      throw new Error(`Cleanup waited instead of skipping a locked row in ${queryMarker}`)
    }),
  ])
}
