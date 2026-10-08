import type { QueryExecutor } from '@data-stores/psql'
import { reserveClassifierRun } from '@services/classifier-runs'
import { createStoryClusteringRunAdapter } from '@services/stories/clustering/adapter'
import { createTestRssFeed } from './rss-feed-create.mts'
import {
  createStoryClusteringItem,
  readStoryRunCandidates,
} from './data-stores/psql/classifier-runs/story-clustering-fixture.mts'

/** Drive two real dispatcher reservations into the reciprocal candidate-FK lock boundary. */
export async function reserveReciprocalStoryRuns() {
  const feed = await createTestRssFeed({})
  const items = await Promise.all([
    createStoryClusteringItem({ feedId: feed.id }),
    createStoryClusteringItem({ feedId: feed.id }),
  ])
  const prepared = Promise.withResolvers<void>()
  const firstLocked = Promise.withResolvers<void>()
  const secondStarted = Promise.withResolvers<void>()
  let captures = 0
  const adapters = items.map((_item, index) => {
    const { ready: _ready, ...adapter } = createStoryClusteringRunAdapter()
    let locks = 0
    return {
      ...adapter,
      captureStoryCandidates: async () => {
        captures += 1
        if (captures === 2) prepared.resolve()
        await prepared.promise
        return [{ kind: 'rss_feed_item' as const, rssFeedItemId: items[1 - index]!.itemId }]
      },
      lockCurrent: async (...args: Parameters<typeof adapter.lockCurrent>) => {
        locks += 1
        if (locks === 1) return adapter.lockCurrent(...args) // preparation's short read
        if (index === 1) await firstLocked.promise
        const query =
          index === 0
            ? args[0]
            : new Proxy(args[0], {
                apply(target, thisArgument, argumentsList: Parameters<QueryExecutor>) {
                  const input = argumentsList[0]
                  const statement = typeof input === 'string' ? input : input.text
                  // Actor-first blocks before taking B. Before the fix B was taken first; signal
                  // after its row lock completes so the two FK checks deterministically form a cycle.
                  if (statement.includes('lockStoryClusteringActor')) secondStarted.resolve()
                  const result = Reflect.apply(target, thisArgument, argumentsList)
                  if (statement.includes('lockRssFeedItemClassifierInput')) {
                    return Promise.resolve(result).then(value => {
                      secondStarted.resolve()
                      return value
                    })
                  }
                  return result
                },
              })
        const current = await adapter.lockCurrent(query, args[1])
        if (index === 0) {
          firstLocked.resolve()
          await secondStarted.promise
        }
        return current
      },
    }
  })
  const results = await Promise.all(
    items.map((item, index) => reserveClassifierRun(adapters[index]!, item.subject)),
  )
  const candidates = await Promise.all(
    results.map(result => {
      if (result.kind !== 'reserved') throw new Error(`Expected reserved, got ${result.kind}`)
      return readStoryRunCandidates(result.run.runId)
    }),
  )
  return { results, candidates, itemIds: items.map(item => item.itemId) }
}
