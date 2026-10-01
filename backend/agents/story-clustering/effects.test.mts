import { describe, expect, it } from 'vitest'
import { completeClassifierRun } from '@services/classifier-runs'
import { createStoryClusteringRunAdapter } from '@services/stories'
import { STORY_CLUSTER_REASON } from '@services/stories/clustering/metadata'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { insertTestStory, setTestItemStoryId } from '@voucha/test-helpers'
import {
  createFakeChoiceClient,
  type FakeChoicePick,
} from '@voucha/test-helpers/agents/story-clustering/fake-choice-client'
import { lockStoryOfficialItemForTest } from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-edits'
import {
  claimStoryClusteringLease,
  createStoryClusteringItem,
  makeStoryClusteringVectors,
  readItemStoryId,
  readStoryFacts,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-fixture'
import { executeStoryClusteringRun } from './execute.mts'

const adapter = createStoryClusteringRunAdapter()
const signal = new AbortController().signal
const DAY_MS = 24 * 60 * 60 * 1000

/** An incoming item and one standalone neighbor, both fresh and embedded close together. */
async function pair(options: { incomingTitle?: string; neighborPublishedAt?: Date } = {}) {
  const { unit, near } = makeStoryClusteringVectors()
  const feed = await createTestRssFeed({})
  const neighbor = await createStoryClusteringItem({
    feedId: feed.id,
    embedding: near,
    title: 'The neighbor headline',
    ...(options.neighborPublishedAt ? { publishedAt: options.neighborPublishedAt } : {}),
  })
  const incoming = await createStoryClusteringItem({
    feedId: feed.id,
    embedding: unit,
    ...(options.incomingTitle ? { title: options.incomingTitle } : {}),
  })
  return { feed, neighbor, incoming }
}

/** Runs the whole lifecycle for the item: lease, one provider decision, effects. */
async function decide(
  incoming: Awaited<ReturnType<typeof pair>>['incoming'],
  pick: FakeChoicePick,
) {
  const lease = await claimStoryClusteringLease(incoming)
  const provider = createFakeChoiceClient(pick)
  const executed = await executeStoryClusteringRun(
    { adapter, lease, maxAttempts: 3, signal },
    { createClient: provider.createClient },
  )
  const completed = await completeClassifierRun(adapter, lease)
  return { lease, provider, executed, completed }
}

describe('story clustering effects (real PG)', () => {
  it('founds a story from the pair when a standalone neighbor is picked', async () => {
    const earlier = new Date(Date.now() - 2 * DAY_MS)
    const { neighbor, incoming } = await pair({ neighborPublishedAt: earlier })

    const { completed } = await decide(incoming, { rssFeedItemId: neighbor.itemId })

    const storyId = await readItemStoryId(incoming.itemId)
    expect(storyId).not.toBeNull()
    expect(completed).toEqual({
      kind: 'completed',
      effects: { kind: 'created', storyId },
    })
    expect(await readItemStoryId(neighbor.itemId)).toBe(storyId)
    const story = await readStoryFacts(storyId!)
    expect(story).toMatchObject({
      title: 'The neighbor headline',
      cluster_reason: STORY_CLUSTER_REASON,
      official_rss_feed_item_id: null,
      official_locked_at: null,
      deleted_at: null,
    })
    expect(story.member_ids.toSorted()).toEqual([incoming.itemId, neighbor.itemId].toSorted())
    expect(story.published_at!.getTime()).toBeLessThanOrEqual(earlier.getTime())
  })

  it('adds the item to the existing story a story candidate stands for', async () => {
    const { neighbor, incoming } = await pair()
    const story = await insertTestStory()
    await setTestItemStoryId(neighbor.itemId, story.id)

    const { completed } = await decide(incoming, { storyId: story.id })

    expect(completed).toEqual({
      kind: 'completed',
      effects: { kind: 'joined', storyId: story.id },
    })
    expect(await readItemStoryId(incoming.itemId)).toBe(story.id)
    expect((await readStoryFacts(story.id)).member_ids.toSorted()).toEqual(
      [incoming.itemId, neighbor.itemId].toSorted(),
    )
  })

  it('leaves an admin-locked official item alone when it joins an existing story', async () => {
    const { neighbor, incoming } = await pair()
    const story = await insertTestStory()
    await setTestItemStoryId(neighbor.itemId, story.id)
    await lockStoryOfficialItemForTest(story.id, neighbor.itemId)
    const before = await readStoryFacts(story.id)

    await decide(incoming, { storyId: story.id })

    const after = await readStoryFacts(story.id)
    expect(after.official_rss_feed_item_id).toBe(neighbor.itemId)
    expect(after.official_locked_at).toEqual(before.official_locked_at)
    expect(after.member_ids).toContain(incoming.itemId)
  })

  it('never writes an official item of its own, even when it founds the story', async () => {
    const { neighbor, incoming } = await pair()

    await decide(incoming, { rssFeedItemId: neighbor.itemId })

    const story = await readStoryFacts((await readItemStoryId(incoming.itemId))!)
    expect(story.official_rss_feed_item_id).toBeNull()
    expect(story.official_locked_at).toBeNull()
  })

  it('does nothing when the model answers none, and still completes the run', async () => {
    const { neighbor, incoming } = await pair()

    const { completed, provider } = await decide(incoming, 'none')

    expect(completed).toEqual({ kind: 'completed', effects: { kind: 'none' } })
    expect(provider.decide).toHaveBeenCalledTimes(1)
    expect(await readItemStoryId(incoming.itemId)).toBeNull()
    expect(await readItemStoryId(neighbor.itemId)).toBeNull()
  })

  it('joins nothing when the chosen candidate is below the confidence threshold', async () => {
    const { neighbor, incoming } = await pair()

    const { completed } = await decide(incoming, {
      probabilities: { [`rss_feed_item:${neighbor.itemId}`]: 0.64, none: 0.36 },
    })

    expect(completed).toEqual({ kind: 'completed', effects: { kind: 'none' } })
    expect(await readItemStoryId(incoming.itemId)).toBeNull()
  })

  it('joins when the chosen candidate sits exactly on the confidence threshold', async () => {
    const { neighbor, incoming } = await pair()

    const { completed } = await decide(incoming, {
      probabilities: { [`rss_feed_item:${neighbor.itemId}`]: 0.65, none: 0.35 },
    })

    expect(completed).toMatchObject({ kind: 'completed', effects: { kind: 'created' } })
    expect(await readItemStoryId(incoming.itemId)).not.toBeNull()
  })

  it('replays a completed run without a second provider call or a second story', async () => {
    const { neighbor, incoming } = await pair()
    const first = await decide(incoming, { rssFeedItemId: neighbor.itemId })
    const storyId = await readItemStoryId(incoming.itemId)

    const replay = await completeClassifierRun(adapter, first.lease)

    expect(replay).toEqual({ kind: 'replay' })
    expect(first.provider.decide).toHaveBeenCalledTimes(1)
    expect(await readItemStoryId(incoming.itemId)).toBe(storyId)
    expect((await readStoryFacts(storyId!)).member_ids).toHaveLength(2)
  })
})
