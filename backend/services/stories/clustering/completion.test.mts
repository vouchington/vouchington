import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { insertTestStory, setTestItemStoryId } from '@voucha/test-helpers'
import { softDeleteRssFeedItemForTest } from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-edits'
import { createStoryClusteringItem } from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-fixture'
import { upsertSystemUser } from '@services/users/system-users'
import * as cacheInvalidation from '../cache-invalidation.mts'
import { completeStoryClusteringRun } from './completion.mts'

async function item() {
  const feed = await createTestRssFeed({})
  return createStoryClusteringItem({ feedId: feed.id })
}

/** Observes the real replay's cache invalidation; the spy sees every call in the process. */
function observeInvalidations() {
  return vi.spyOn(cacheInvalidation, 'invalidateStories')
}

const callsFor = (spy: ReturnType<typeof observeInvalidations>, storyId: string) =>
  spy.mock.calls.filter(args => args.includes(storyId))

describe('completeStoryClusteringRun (real PG)', () => {
  beforeAll(async () => {
    await upsertSystemUser('story-teller')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("finishes the story the item is in, read from the item and not from the run's own summary", async () => {
    const clustered = await item()
    const story = await insertTestStory()
    await setTestItemStoryId(clustered.itemId, story.id)
    const invalidate = observeInvalidations()

    await completeStoryClusteringRun(clustered.subject)

    expect(callsFor(invalidate, story.id)).toEqual([[story.id]])
  })

  it('can run again after a crash, finishing the same story each time', async () => {
    const clustered = await item()
    const story = await insertTestStory()
    await setTestItemStoryId(clustered.itemId, story.id)
    const invalidate = observeInvalidations()

    await completeStoryClusteringRun(clustered.subject)
    await completeStoryClusteringRun(clustered.subject)

    expect(callsFor(invalidate, story.id)).toEqual([[story.id], [story.id]])
  })

  it('has nothing to finish for an item that joined no story', async () => {
    const unclustered = await item()
    const invalidate = observeInvalidations()

    await completeStoryClusteringRun(unclustered.subject)

    expect(invalidate.mock.calls.filter(args => args.includes(null))).toEqual([])
  })

  it('has nothing to finish for an item deleted since, whatever story it was in', async () => {
    const deleted = await item()
    const story = await insertTestStory()
    await setTestItemStoryId(deleted.itemId, story.id)
    await softDeleteRssFeedItemForTest(deleted.itemId)
    const invalidate = observeInvalidations()

    await completeStoryClusteringRun(deleted.subject)

    expect(callsFor(invalidate, story.id)).toEqual([])
  })

  it('has nothing to finish for a subject that is not an RSS feed item', async () => {
    const invalidate = observeInvalidations()

    await completeStoryClusteringRun({ postId: 'a-post', rssFeedItemId: null })

    expect(invalidate.mock.calls.filter(args => args.includes(null))).toEqual([])
  })
})
