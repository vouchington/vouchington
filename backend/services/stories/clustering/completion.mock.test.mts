import { beforeEach, describe, expect, it, vi } from 'vitest'

const { replayClusteredStory } = vi.hoisted(() => ({
  replayClusteredStory: vi.fn<(storyId: string) => Promise<void>>(),
}))

vi.mock<typeof import('../cluster-retry.mts')>(import('../cluster-retry.mts'), () => ({
  replayClusteredStory,
}))

import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { insertTestStory, setTestItemStoryId } from '@voucha/test-helpers'
import { softDeleteRssFeedItemForTest } from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-edits'
import { createStoryClusteringItem } from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-fixture'
import { completeStoryClusteringRun } from './completion.mts'

async function item() {
  const feed = await createTestRssFeed({})
  return createStoryClusteringItem({ feedId: feed.id })
}

describe('completeStoryClusteringRun (real PG)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("finishes the story the item is in, read from the item and not from the run's own summary", async () => {
    const clustered = await item()
    const story = await insertTestStory()
    await setTestItemStoryId(clustered.itemId, story.id)

    await completeStoryClusteringRun(clustered.subject)

    expect(replayClusteredStory).toHaveBeenCalledExactlyOnceWith(story.id)
  })

  it('can run again after a crash, finishing the same story each time', async () => {
    const clustered = await item()
    const story = await insertTestStory()
    await setTestItemStoryId(clustered.itemId, story.id)

    await completeStoryClusteringRun(clustered.subject)
    await completeStoryClusteringRun(clustered.subject)

    expect(replayClusteredStory.mock.calls).toEqual([[story.id], [story.id]])
  })

  it('has nothing to finish for an item that joined no story', async () => {
    await completeStoryClusteringRun((await item()).subject)

    expect(replayClusteredStory).not.toHaveBeenCalled()
  })

  it('has nothing to finish for an item deleted since, whatever story it was in', async () => {
    const deleted = await item()
    await setTestItemStoryId(deleted.itemId, (await insertTestStory()).id)
    await softDeleteRssFeedItemForTest(deleted.itemId)

    await completeStoryClusteringRun(deleted.subject)

    expect(replayClusteredStory).not.toHaveBeenCalled()
  })

  it('has nothing to finish for a subject that is not an RSS feed item', async () => {
    await completeStoryClusteringRun({ postId: 'a-post', rssFeedItemId: null })

    expect(replayClusteredStory).not.toHaveBeenCalled()
  })
})
