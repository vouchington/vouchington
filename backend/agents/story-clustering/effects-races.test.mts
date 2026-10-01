import { describe, expect, it } from 'vitest'
import { completeClassifierRun } from '@services/classifier-runs'
import { adminAssignItemToStory, createStoryClusteringRunAdapter } from '@services/stories'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import {
  deleteTestStory,
  insertTestStory,
  setTestItemStoryId,
  setTestItemStoryLocked,
} from '@voucha/test-helpers'
import {
  createFakeChoiceClient,
  type FakeChoicePick,
} from '@voucha/test-helpers/agents/story-clustering/fake-choice-client'
import {
  reviseStoryClusteringItem,
  softDeleteRssFeedItemForTest,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-edits'
import { getSubjectClassifierRunFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
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

/** An incoming item with one standalone neighbor, and its run already holding a persisted decision. */
async function persistedDecision(
  pick: (neighborId: string) => FakeChoicePick,
  neighborStoryId?: string,
) {
  const { unit, near } = makeStoryClusteringVectors()
  const feed = await createTestRssFeed({})
  const neighbor = await createStoryClusteringItem({ feedId: feed.id, embedding: near })
  if (neighborStoryId) await setTestItemStoryId(neighbor.itemId, neighborStoryId)
  const incoming = await createStoryClusteringItem({ feedId: feed.id, embedding: unit })
  const lease = await claimStoryClusteringLease(incoming)
  const provider = createFakeChoiceClient(pick(neighbor.itemId))
  await executeStoryClusteringRun(
    { adapter, lease, maxAttempts: 3, signal },
    { createClient: provider.createClient },
  )
  return { feed, neighbor, incoming, lease, provider }
}

const pickNeighbor = (neighborId: string): FakeChoicePick => ({ rssFeedItemId: neighborId })

describe('applying a story clustering decision after the world moved (real PG)', () => {
  it('skips an item an admin locked out of stories since the decision', async () => {
    const { incoming, neighbor, lease } = await persistedDecision(pickNeighbor)
    await setTestItemStoryLocked(incoming.itemId, true)

    await expect(completeClassifierRun(adapter, lease)).resolves.toEqual({
      kind: 'completed',
      effects: { kind: 'skipped', reason: 'item_unavailable' },
    })

    expect(await readItemStoryId(incoming.itemId)).toBeNull()
    expect(await readItemStoryId(neighbor.itemId)).toBeNull()
  })

  it('skips an item that another path already put in a story', async () => {
    const { incoming, neighbor, lease } = await persistedDecision(pickNeighbor)
    const other = await insertTestStory()
    await setTestItemStoryId(incoming.itemId, other.id)

    await expect(completeClassifierRun(adapter, lease)).resolves.toMatchObject({
      effects: { kind: 'skipped', reason: 'item_unavailable' },
    })

    expect(await readItemStoryId(incoming.itemId)).toBe(other.id)
    expect(await readItemStoryId(neighbor.itemId)).toBeNull()
  })

  it('brings the item into the story its chosen neighbor joined since the decision', async () => {
    const { incoming, neighbor, lease } = await persistedDecision(pickNeighbor)
    const joined = await insertTestStory()
    await setTestItemStoryId(neighbor.itemId, joined.id)

    await expect(completeClassifierRun(adapter, lease)).resolves.toEqual({
      kind: 'completed',
      effects: { kind: 'joined', storyId: joined.id },
    })

    expect(await readItemStoryId(incoming.itemId)).toBe(joined.id)
    expect((await readStoryFacts(joined.id)).member_ids).toHaveLength(2)
  })

  it('skips when the chosen neighbor was locked out of stories since the decision', async () => {
    const { incoming, neighbor, lease } = await persistedDecision(pickNeighbor)
    await setTestItemStoryLocked(neighbor.itemId, true)

    await expect(completeClassifierRun(adapter, lease)).resolves.toMatchObject({
      effects: { kind: 'skipped', reason: 'candidate_unavailable' },
    })

    expect(await readItemStoryId(incoming.itemId)).toBeNull()
  })

  it('skips when the chosen neighbor was deleted since the decision', async () => {
    const { incoming, neighbor, lease } = await persistedDecision(pickNeighbor)
    await softDeleteRssFeedItemForTest(neighbor.itemId)

    await expect(completeClassifierRun(adapter, lease)).resolves.toMatchObject({
      effects: { kind: 'skipped', reason: 'candidate_unavailable' },
    })

    expect(await readItemStoryId(incoming.itemId)).toBeNull()
  })

  it('skips when the chosen story was deleted since the decision, and never revives it', async () => {
    const story = await insertTestStory()
    const { incoming, lease } = await persistedDecision(() => ({ storyId: story.id }), story.id)
    await deleteTestStory(story.id)

    await expect(completeClassifierRun(adapter, lease)).resolves.toMatchObject({
      effects: { kind: 'skipped', reason: 'story_unavailable' },
    })

    expect(await readItemStoryId(incoming.itemId)).toBeNull()
    expect((await readStoryFacts(story.id)).deleted_at).not.toBeNull()
  })

  it('is stale, applying nothing, once the item content moved on after the decision', async () => {
    const { incoming, neighbor, lease } = await persistedDecision(pickNeighbor)
    await reviseStoryClusteringItem(incoming.itemId)

    await expect(completeClassifierRun(adapter, lease)).resolves.toEqual({ kind: 'stale' })

    expect(await readItemStoryId(incoming.itemId)).toBeNull()
    expect(await readItemStoryId(neighbor.itemId)).toBeNull()
  })

  it('rolls the story and receipt back when a later effect fails, then applies it once', async () => {
    const { incoming, neighbor, lease, provider } = await persistedDecision(pickNeighbor)
    const failing: typeof adapter = {
      ...adapter,
      applyEffects: async (query, current, outcomes) => {
        await adapter.applyEffects(query, current, outcomes)
        throw new Error('a later effect failed')
      },
    }

    await expect(completeClassifierRun(failing, lease)).rejects.toThrow('a later effect failed')
    expect(await readItemStoryId(incoming.itemId)).toBeNull()
    expect(await readItemStoryId(neighbor.itemId)).toBeNull()
    expect(await getSubjectClassifierRunFacts(incoming.subject)).toMatchObject([
      { completed_at: null },
    ])

    await expect(completeClassifierRun(adapter, lease)).resolves.toMatchObject({
      effects: { kind: 'created' },
    })
    const storyId = await readItemStoryId(incoming.itemId)
    expect(await readItemStoryId(neighbor.itemId)).toBe(storyId)
    expect(provider.decide).toHaveBeenCalledTimes(1)
  })

  it('does not deadlock when completing a join and an admin assignment overlap on one item', async () => {
    const story = await insertTestStory()
    const { incoming, lease } = await persistedDecision(() => ({ storyId: story.id }), story.id)
    const overlap = Promise.all([
      completeClassifierRun(adapter, lease),
      adminAssignItemToStory(story.id, incoming.itemId),
    ])

    await expect(
      Promise.race([
        overlap,
        new Promise<never>((_resolve, reject) => {
          AbortSignal.timeout(5_000).addEventListener(
            'abort',
            () => reject(new Error('overlapping assignment deadlocked')),
            { once: true },
          )
        }),
      ]),
    ).resolves.toBeDefined()

    expect(await readItemStoryId(incoming.itemId)).toBe(story.id)
  })
})
