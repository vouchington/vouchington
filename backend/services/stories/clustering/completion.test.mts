import { describe, expect, it, vi } from 'vitest'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { insertTestStory, setTestItemStoryId } from '@voucha/test-helpers'
import { softDeleteRssFeedItemForTest } from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-edits'
import { createStoryClusteringItem } from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-fixture'
import { completeStoryClusteringRun } from './completion.mts'

async function item() {
  const feed = await createTestRssFeed({})
  return createStoryClusteringItem({ feedId: feed.id })
}

const replaySpy = () => vi.fn<(storyId: string) => Promise<void>>()

describe('completeStoryClusteringRun (real PG)', () => {
  it("finishes the story the item is in, read from the item and not from the run's own summary", async () => {
    const clustered = await item()
    const story = await insertTestStory()
    await setTestItemStoryId(clustered.itemId, story.id)
    const replay = replaySpy()

    await completeStoryClusteringRun(clustered.subject, replay)

    expect(replay).toHaveBeenCalledExactlyOnceWith(story.id)
  })

  it('can run again after a crash, finishing the same story each time', async () => {
    const clustered = await item()
    const story = await insertTestStory()
    await setTestItemStoryId(clustered.itemId, story.id)
    const replay = replaySpy()

    await completeStoryClusteringRun(clustered.subject, replay)
    await completeStoryClusteringRun(clustered.subject, replay)

    expect(replay.mock.calls).toEqual([[story.id], [story.id]])
  })

  it('has nothing to finish for an item that joined no story', async () => {
    const replay = replaySpy()

    await completeStoryClusteringRun((await item()).subject, replay)

    expect(replay).not.toHaveBeenCalled()
  })

  it('has nothing to finish for an item deleted since, whatever story it was in', async () => {
    const deleted = await item()
    await setTestItemStoryId(deleted.itemId, (await insertTestStory()).id)
    await softDeleteRssFeedItemForTest(deleted.itemId)
    const replay = replaySpy()

    await completeStoryClusteringRun(deleted.subject, replay)

    expect(replay).not.toHaveBeenCalled()
  })

  it('has nothing to finish for a subject that is not an RSS feed item', async () => {
    const replay = replaySpy()

    await completeStoryClusteringRun({ postId: 'a-post', rssFeedItemId: null }, replay)

    expect(replay).not.toHaveBeenCalled()
  })
})
