import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import {
  setFeedItemContentHashForTest,
  setFeedItemDeletedForTest,
  sweepableFeedItemIds,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/request-retirement'
import { getSubjectClassifierRunRequestFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { reviseStoryClusteringItem } from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-edits'
import {
  createStoryClusteringItem,
  makeStoryClusteringVectors,
  requestStoryClusteringFeedItems,
  requestStoryClusteringRun,
  reserveStoryClusteringRun,
  STORY_CLUSTERING_CLASSIFIER_SLUG,
  type StoryClusteringItem,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-fixture'
import { describe, expect, it } from 'vitest'
import { createStoryClusteringRunAdapter } from '../adapter.mts'

const adapter = createStoryClusteringRunAdapter()

/** An embedded item with a request and a neighbor, so a reservation would have work. */
async function createRequestedItem(options: { embedded?: boolean } = {}) {
  const { unit, near } = makeStoryClusteringVectors()
  const feed = await createTestRssFeed({})
  await createStoryClusteringItem({ feedId: feed.id, embedding: near })
  const item = await createStoryClusteringItem({
    feedId: feed.id,
    ...(options.embedded === false ? {} : { embedding: unit }),
  })
  await requestStoryClusteringRun(item)
  return item
}

async function requestIsRetired(item: StoryClusteringItem): Promise<boolean[]> {
  const requests = await getSubjectClassifierRunRequestFacts(
    item.subject,
    STORY_CLUSTERING_CLASSIFIER_SLUG,
  )
  return requests.map(request => request.stale_at !== null)
}

describe('story clustering request retirement (real PG)', () => {
  it('keeps the request of an item while its embedding is still being built', async () => {
    const item = await createRequestedItem({ embedded: false })

    expect(await sweepableFeedItemIds(adapter)).not.toContain(item.itemId)

    expect(await requestIsRetired(item)).toEqual([false])
  })

  it('retires the request of a deleted item and re-arms it when the upsert revives the item', async () => {
    const item = await createRequestedItem()
    await setFeedItemDeletedForTest(item.itemId, true)

    expect(await sweepableFeedItemIds(adapter)).not.toContain(item.itemId)
    expect(await requestIsRetired(item)).toEqual([true])

    await setFeedItemDeletedForTest(item.itemId, false)
    await requestStoryClusteringFeedItems([item.itemId])

    expect(await requestIsRetired(item)).toEqual([false])
    expect(await sweepableFeedItemIds(adapter)).toContain(item.itemId)
  })

  it('retires the request for content an item moved away from and re-arms it when it returns', async () => {
    const item = await createRequestedItem()
    await reviseStoryClusteringItem(item.itemId)

    expect(await sweepableFeedItemIds(adapter)).not.toContain(item.itemId)
    expect(await requestIsRetired(item)).toEqual([true])

    await setFeedItemContentHashForTest(item.itemId, item.inputSha256)
    await requestStoryClusteringFeedItems([item.itemId])

    expect(await requestIsRetired(item)).toEqual([false])
    expect(await sweepableFeedItemIds(adapter)).toContain(item.itemId)
  })

  it('does not re-arm a request that settled with a run when the item is re-upserted', async () => {
    const item = await createRequestedItem()
    const run = await reserveStoryClusteringRun(item)

    await requestStoryClusteringFeedItems([item.itemId])

    const requests = await getSubjectClassifierRunRequestFacts(
      item.subject,
      STORY_CLUSTERING_CLASSIFIER_SLUG,
    )
    expect(requests.map(request => request.run_id)).toEqual([run.runId])
    expect(await sweepableFeedItemIds(adapter)).not.toContain(item.itemId)
  })
})
