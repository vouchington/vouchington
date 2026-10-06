import { describe, expect, it } from 'vitest'
import { createStoryClusteringRunAdapter } from '@services/stories'
import { completeClassifierRun } from '@services/classifier-runs'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { insertTestStory, setTestItemStoryId } from '@voucha/test-helpers'
import { createFakeChoiceClient } from '@voucha/test-helpers/agents/story-clustering/fake-choice-client'
import {
  claimStoryClusteringLease,
  createStoryClusteringItem,
  makeStoryClusteringVectors,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-fixture'
import { softDeleteRssFeedItemForTest } from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-edits'
import { getSubjectClassifierRunFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { STORY_CLUSTERING_NONE_KEY, STORY_CLUSTERING_QUESTION_ID } from './bindings.mts'
import { executeStoryClusteringRun } from './execute.mts'
import { buildStoryClusteringRunInput } from './run-input.mts'

const adapter = createStoryClusteringRunAdapter()
const signal = new AbortController().signal

/** One incoming item with `count` standalone neighbors near enough to be captured as candidates. */
async function incomingWithNeighbors(count: number) {
  const { unit, at } = makeStoryClusteringVectors()
  const feed = await createTestRssFeed({})
  const neighbors = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      createStoryClusteringItem({ feedId: feed.id, embedding: at(0.95 - i * 0.05) }),
    ),
  )
  const incoming = await createStoryClusteringItem({ feedId: feed.id, embedding: unit })
  return { feed, neighbors, incoming, vectors: { unit, at } }
}

describe('executeStoryClusteringRun (real PG)', () => {
  it('bills one provider attempt, persists the decision, and replays without calling again', async () => {
    const { incoming } = await incomingWithNeighbors(2)
    const lease = await claimStoryClusteringLease(incoming)
    const { createClient, decide } = createFakeChoiceClient('none')
    const input = { adapter, lease, maxAttempts: 3, signal }

    await expect(executeStoryClusteringRun(input, { createClient })).resolves.toBe('persisted')
    await expect(executeStoryClusteringRun(input, { createClient })).resolves.toBe('replay')

    expect(decide).toHaveBeenCalledTimes(1)
    expect(createClient).toHaveBeenCalledTimes(1)
    expect(await getSubjectClassifierRunFacts(incoming.subject)).toMatchObject([
      { provider_attempts_started: 1, outcomes_persisted_at: expect.any(Date) },
    ])
  })

  it('asks one Choice question over exactly the captured candidates and the unbound none', async () => {
    const { incoming, neighbors } = await incomingWithNeighbors(3)
    const lease = await claimStoryClusteringLease(incoming)
    const { createClient, decide } = createFakeChoiceClient('none')

    await executeStoryClusteringRun({ adapter, lease, maxAttempts: 3, signal }, { createClient })

    expect(decide).toHaveBeenCalledTimes(1)
    const { questions } = decide.mock.calls[0]![0]
    expect(questions).toHaveLength(1)
    expect(questions[0]).toMatchObject({
      id: STORY_CLUSTERING_QUESTION_ID,
      type: 'choice',
      criteria: [
        ...neighbors.map(neighbor => `rss_feed_item:${neighbor.itemId}`),
        STORY_CLUSTERING_NONE_KEY,
      ],
    })
  })

  it('keeps asking the captured candidates after a closer neighbor appears, so a replay never differs', async () => {
    const { feed, incoming, vectors } = await incomingWithNeighbors(1)
    const lease = await claimStoryClusteringLease(incoming)
    const item = (await getRssFeedItemById(incoming.itemId, { readOnly: false }))!
    const before = await buildStoryClusteringRunInput(lease, item)

    const closer = await createStoryClusteringItem({
      feedId: feed.id,
      embedding: vectors.at(0.999),
    })
    const after = await buildStoryClusteringRunInput(lease, item)

    expect(after).toEqual(before)
    expect(JSON.stringify(after)).not.toContain(closer.itemId)
  })

  it('has no remote work, rather than throwing, when no candidate was captured', async () => {
    const { incoming } = await incomingWithNeighbors(1)
    const lease = await claimStoryClusteringLease(incoming)
    const item = (await getRssFeedItemById(incoming.itemId, { readOnly: false }))!

    await expect(
      buildStoryClusteringRunInput({ ...lease, capturedStoryCandidates: [] }, item),
    ).resolves.toBeNull()
  })

  it('still asks about a story whose members all left, describing it by structure only', async () => {
    const { feed, incoming, vectors } = await incomingWithNeighbors(0)
    const story = await insertTestStory()
    const member = await createStoryClusteringItem({
      feedId: feed.id,
      embedding: vectors.at(0.95),
    })
    await setTestItemStoryId(member.itemId, story.id)
    const lease = await claimStoryClusteringLease(incoming)
    await softDeleteRssFeedItemForTest(member.itemId)
    const { createClient, decide } = createFakeChoiceClient('none')

    await executeStoryClusteringRun({ adapter, lease, maxAttempts: 3, signal }, { createClient })

    const request = decide.mock.calls[0]![0]
    expect(request.questions[0]).toMatchObject({
      criteria: [`story:${story.id}`, STORY_CLUSTERING_NONE_KEY],
    })
    expect(request.state).toContain(`Candidate key: story:${story.id}`)
    expect(request.state).toContain('Content unavailable')
  })

  it('is stale, with no client built and no attempt reserved, once the item content moved on', async () => {
    const { incoming } = await incomingWithNeighbors(1)
    const lease = await claimStoryClusteringLease(incoming)
    const { createClient } = createFakeChoiceClient('none')
    const moved = { ...lease, inputSha256: Buffer.alloc(32, 1) }

    await expect(
      executeStoryClusteringRun(
        { adapter, lease: moved, maxAttempts: 3, signal },
        { createClient },
      ),
    ).resolves.toBe('stale')

    expect(createClient).not.toHaveBeenCalled()
    expect(await getSubjectClassifierRunFacts(incoming.subject)).toMatchObject([
      { provider_attempts_started: 0, outcomes_persisted_at: null },
    ])
  })

  it('is stale when the item no longer exists', async () => {
    const { incoming } = await incomingWithNeighbors(1)
    const lease = await claimStoryClusteringLease(incoming)
    await softDeleteRssFeedItemForTest(incoming.itemId)
    const { createClient } = createFakeChoiceClient('none')

    await expect(
      executeStoryClusteringRun({ adapter, lease, maxAttempts: 3, signal }, { createClient }),
    ).resolves.toBe('stale')
    expect(createClient).not.toHaveBeenCalled()
  })

  it('refuses a run that has no RSS feed item subject', async () => {
    const { incoming } = await incomingWithNeighbors(1)
    const lease = await claimStoryClusteringLease(incoming)
    const { createClient } = createFakeChoiceClient('none')
    const postRun = { ...lease, subject: { postId: lease.runId, rssFeedItemId: null } } as const

    await expect(
      executeStoryClusteringRun(
        { adapter, lease: postRun, maxAttempts: 3, signal },
        { createClient },
      ),
    ).rejects.toThrow('requires an RSS feed item subject')
  })

  it('refuses to apply effects for a decision it never persisted', async () => {
    const { incoming } = await incomingWithNeighbors(1)
    const lease = await claimStoryClusteringLease(incoming)

    await expect(completeClassifierRun(adapter, lease)).rejects.toThrow(
      'outcomes must persist before completion',
    )
    expect(await getSubjectClassifierRunFacts(incoming.subject)).toMatchObject([
      { completed_at: null },
    ])
  })
})
