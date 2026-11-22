import { reserveClassifierRun } from '../services/classifier-runs/index.mts'
import { createStoryClusteringRunAdapter } from '../services/stories/clustering/adapter.mts'
import { createTestRssFeed } from './rss-feed-create.mts'
import {
  createStoryClusteringItem,
  readStoryRunCandidates,
} from './data-stores/psql/classifier-runs/story-clustering-fixture.mts'

/** Reserve two runs whose prepared candidates point to each other. */
export async function reserveReciprocalStoryRuns() {
  const feed = await createTestRssFeed({})
  const items = await Promise.all([
    createStoryClusteringItem({ feedId: feed.id }),
    createStoryClusteringItem({ feedId: feed.id }),
  ])
  const prepared = Promise.withResolvers<void>()
  let captures = 0
  const adapters = items.map((_item, index) => {
    const { ready: _ready, ...adapter } = createStoryClusteringRunAdapter()
    return {
      ...adapter,
      captureStoryCandidates: async () => {
        captures += 1
        if (captures === 2) prepared.resolve()
        await prepared.promise
        return [{ kind: 'rss_feed_item' as const, rssFeedItemId: items[1 - index]!.itemId }]
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
