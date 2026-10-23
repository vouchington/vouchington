import { beginTransaction } from '@data-stores/psql'
import { runWithCapturedQueries } from '@data-stores/psql/query-capture'
import type { QueryExecutor } from '@data-stores/psql/types'

/** Reproduces a merge holding image authority while an update reaches that authority. */
export async function runTopicImageMergeLockRace(
  sourceId: string,
  destinationId: string,
  merge: () => Promise<unknown>,
  update: (query: QueryExecutor) => Promise<unknown>,
) {
  if (destinationId >= sourceId)
    throw new Error('Destination must lock before source in the merge row query')

  const destinationLocked = Promise.withResolvers<void>()
  const releaseDestination = Promise.withResolvers<void>()
  const imageOwnerLocked = Promise.withResolvers<void>()
  const updateReachedImageOwner = Promise.withResolvers<void>()
  void Promise.allSettled([imageOwnerLocked.promise, updateReachedImageOwner.promise])

  async function holdDestinationRow() {
    await using query = await beginTransaction()
    await query(
      '/* runTopicImageMergeLockRace:destination */ SELECT id FROM topics WHERE id = $1::uuid FOR UPDATE',
      [destinationId],
    )
    destinationLocked.resolve()
    await releaseDestination.promise
    await query.commit()
  }

  const holder = holdDestinationRow()
  let merging: Promise<unknown> | undefined
  let updating: Promise<unknown> | undefined
  try {
    await destinationLocked.promise
    const diagnostics = await runWithCapturedQueries(async context => {
      const unsubscribe = context.subscribe(event => {
        if (event.text.includes('/* lockSurfaceOwnerDomains */')) {
          if (event.status === 'fulfilled') imageOwnerLocked.resolve()
          else imageOwnerLocked.reject(event.reason)
        }
        return undefined
      })
      try {
        merging = merge()
        void merging.catch(imageOwnerLocked.reject)
        await imageOwnerLocked.promise

        await using updateTransaction = await beginTransaction()
        const observedQuery = new Proxy(updateTransaction, {
          apply(target, thisArg, args: Parameters<QueryExecutor>) {
            const input = args[0]
            const statement = typeof input === 'string' ? input : input.text
            if (statement.includes('/* lockSurfaceOwnerDomains */'))
              updateReachedImageOwner.resolve()
            return Reflect.apply(target, thisArg, args)
          },
        })
        updating = update(observedQuery)
        void updating.catch(updateReachedImageOwner.reject)
        await updateReachedImageOwner.promise
        releaseDestination.resolve()
        await holder
        const [mergeResult, updateResult] = await Promise.allSettled([merging, updating])
        return { mergeResult, updateResult }
      } finally {
        unsubscribe()
      }
    })
    await diagnostics.completionDrain
    return diagnostics.result
  } finally {
    releaseDestination.resolve()
    await Promise.allSettled([
      holder,
      ...(merging ? [merging] : []),
      ...(updating ? [updating] : []),
    ])
  }
}
