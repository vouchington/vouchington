import { observeTestPostgresClientQueries } from './postgres-query-pool-observer.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'

/** Pause the real winner after its owner fence, then witness the competing native lock wait. */
export async function runHouseholdAdmissionRace<First, Second>(
  userId: string,
  first: () => Promise<First>,
  second: () => Promise<Second>,
): Promise<{ first: PromiseSettledResult<First>; second: PromiseSettledResult<Second> }> {
  const fenced = Promise.withResolvers<number>()
  const release = Promise.withResolvers<void>()
  let captured = false
  let started: { outcome: Promise<PromiseSettledResult<First>[]>; processId: number } | undefined
  try {
    const observed = await observeTestPostgresClientQueries(
      async () => {
        const outcome = Promise.allSettled([first()])
        const processId = await Promise.race([
          fenced.promise,
          outcome.then(() => {
            throw new Error('Household winner settled without its owner fence')
          }),
        ])
        return { outcome, processId }
      },
      async (query, client) => {
        if (captured || !query.text.includes('/* lockHouseholdOwnerAdmission */')) return
        captured = true
        const { rows } = await client.query<{ id: number }>(
          '/* householdAdmissionRace */ SELECT pg_backend_pid()::int AS id',
        )
        fenced.resolve(rows[0]!.id)
        await release.promise
      },
    )
    started = observed.result
    return await withTestOwnedPostgresWait(
      {
        holderProcessId: started.processId,
        pool: 'write',
        lock: { kind: 'advisory', key: `household-owner-admission:${userId.toLowerCase()}` },
        queryMarker: 'lockHouseholdOwnerAdmission',
        releaseHolder: async () => {
          release.resolve()
          await started!.outcome
        },
      },
      async waitForLock => {
        const pending = second()
        const outcome = Promise.allSettled([pending])
        await waitForLock(pending)
        release.resolve()
        const [firstResult, secondResult] = await Promise.all([started!.outcome, outcome])
        return { first: firstResult[0]!, second: secondResult[0]! }
      },
    )
  } finally {
    release.resolve()
    await started?.outcome
  }
}
