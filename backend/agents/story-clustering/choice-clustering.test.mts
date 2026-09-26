import { randomUUID, createHash } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  insertTestRssFeedItem,
  insertTestStory,
  createTestUrlWithHostname,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { createFakeStoryClusteringStructuredDecisionClient } from '@voucha/test-helpers/agents/story-clustering/fake-structured-decision-client'
import {
  getActiveClassifierConfigurationBySlugFromPrimary,
  persistClassifierDecision,
} from '@services/classifiers'
import type { StoryClusterCandidateRow } from '@voucha/types/entities/story'
import { STORY_CLUSTERING_NONE_KEY } from './choice-clustering-bindings.mts'
import {
  dispatchStoryClusteringDecision,
  resolveStoryClusteringApiKey,
  type StoryClusteringDispatchInput,
} from './choice-clustering.mts'

// The seeded classifier every test in this file dispatches against
// (0730-00-02-seed-story-clustering-classifier.mts). Nothing here mutates that row -- only
// SELECTs it and inserts decisions against fresh, per-test batchIds -- so concurrent workers
// sharing it is safe (same audit precedent as agents/autotagger/dispatch-classifier.test.mts's
// TAGGING_SLUG comment).
const STORY_CLUSTERING_SLUG = 'story-clustering-classifier'

function sha256(data: unknown): Buffer {
  return createHash('sha256').update(JSON.stringify(data)).digest()
}

let sharedFeed: { id: string }

async function makeItem(title: string): Promise<string> {
  const random = randomUUID()
  const urlId = await createTestUrlWithHostname()
  const itemData = { title, link: `https://example.com/${random}` }
  return insertTestRssFeedItem({
    rssFeedId: sharedFeed.id,
    urlId,
    guid: `choice-clustering-test-${random}`,
    itemData,
    contentSha256: sha256(itemData),
  })
}

function existingStoryCandidate(itemId: string, storyId: string): StoryClusterCandidateRow {
  return { id: itemId, story_id: storyId, story_published_at: null, distance: 0.1 }
}

function standaloneCandidate(itemId: string): StoryClusterCandidateRow {
  return { id: itemId, story_id: null, story_published_at: null, distance: 0.1 }
}

describe('dispatchStoryClusteringDecision', () => {
  beforeAll(async () => {
    sharedFeed = await createTestRssFeed({})
  })

  it('dispatches once, persists the decision, and resolves to the winning existing story', async () => {
    const story = await insertTestStory()
    const memberItemId = await makeItem('Member article')
    const incomingItemId = await makeItem('Incoming article')
    const fake = createFakeStoryClusteringStructuredDecisionClient({ choice: `story:${story.id}` })

    const outcome = await dispatchStoryClusteringDecision(
      {
        batchId: randomUUID(),
        incomingItemId,
        loadCandidates: async () => [existingStoryCandidate(memberItemId, story.id)],
      },
      { createClient: fake.createClient },
    )

    expect(fake.decide).toHaveBeenCalledTimes(1)
    expect(outcome).toEqual({ kind: 'existing_story', storyId: story.id })
  })

  it('resolves to a standalone item winner', async () => {
    const candidateItemId = await makeItem('Standalone candidate')
    const incomingItemId = await makeItem('Incoming article')
    const fake = createFakeStoryClusteringStructuredDecisionClient({
      choice: `rss_feed_item:${candidateItemId}`,
    })

    const outcome = await dispatchStoryClusteringDecision(
      {
        batchId: randomUUID(),
        incomingItemId,
        loadCandidates: async () => [standaloneCandidate(candidateItemId)],
      },
      { createClient: fake.createClient },
    )

    expect(fake.decide).toHaveBeenCalledTimes(1)
    expect(outcome).toEqual({ kind: 'standalone', rssFeedItemId: candidateItemId })
  })

  it('resolves to none when the model picks the none criterion', async () => {
    const candidateItemId = await makeItem('Unrelated candidate')
    const incomingItemId = await makeItem('Incoming article')
    const fake = createFakeStoryClusteringStructuredDecisionClient({
      choice: STORY_CLUSTERING_NONE_KEY,
    })

    const outcome = await dispatchStoryClusteringDecision(
      {
        batchId: randomUUID(),
        incomingItemId,
        loadCandidates: async () => [standaloneCandidate(candidateItemId)],
      },
      { createClient: fake.createClient },
    )

    expect(outcome).toEqual({ kind: 'none' })
  })

  it('resolves to none without dispatching when there are no candidates', async () => {
    const incomingItemId = await makeItem('Incoming article')
    const fake = createFakeStoryClusteringStructuredDecisionClient({
      choice: STORY_CLUSTERING_NONE_KEY,
    })

    const outcome = await dispatchStoryClusteringDecision(
      { batchId: randomUUID(), incomingItemId, loadCandidates: async () => [] },
      { createClient: fake.createClient },
    )

    expect(outcome).toEqual({ kind: 'none' })
    expect(fake.decide).not.toHaveBeenCalled()
  })

  it('replays an already-completed decision idempotently: no re-dispatch', async () => {
    const story = await insertTestStory()
    const memberItemId = await makeItem('Member article')
    const incomingItemId = await makeItem('Incoming article')
    const fake = createFakeStoryClusteringStructuredDecisionClient({ choice: `story:${story.id}` })
    const input: StoryClusteringDispatchInput = {
      batchId: randomUUID(),
      incomingItemId,
      loadCandidates: async () => [existingStoryCandidate(memberItemId, story.id)],
    }

    const first = await dispatchStoryClusteringDecision(input, { createClient: fake.createClient })
    expect(fake.decide).toHaveBeenCalledTimes(1)
    expect(first).toEqual({ kind: 'existing_story', storyId: story.id })

    const second = await dispatchStoryClusteringDecision(input, { createClient: fake.createClient })
    expect(fake.decide).toHaveBeenCalledTimes(1)
    expect(second).toEqual({ kind: 'existing_story', storyId: story.id })
  })

  it('recovers a decision persisted before a crash without ever calling loadCandidates or decide', async () => {
    const story = await insertTestStory()
    const memberItemId = await makeItem('Member article')
    const incomingItemId = await makeItem('Incoming article')
    const batchId = randomUUID()
    const configuration =
      await getActiveClassifierConfigurationBySlugFromPrimary(STORY_CLUSTERING_SLUG)
    if (!configuration) throw new Error('story-clustering-classifier configuration not seeded')

    // Simulate a process crash: the decision was durably persisted (e.g. the provider call and
    // its persistence both succeeded) but the process died before the caller (@services/stories/
    // cluster.mts, not yet rewritten) acted on the outcome.
    await persistClassifierDecision({
      batchId,
      classifierId: configuration.classifierId,
      promptVersionId: configuration.promptVersionId,
      scope: { scopeCategory: 'global', scopeCommunityId: null },
      subject: { postId: null, rssFeedItemId: incomingItemId },
      calls: [
        {
          shardOrdinal: 0,
          results: [
            {
              candidateKind: 'story',
              storyId: story.id,
              storedCandidateId: null,
              probability: 0.95,
              rawResponse: { simulated: 'pre-crash decision' },
            },
          ],
        },
      ],
    })

    const fake = createFakeStoryClusteringStructuredDecisionClient({ choice: `story:${story.id}` })
    let loadCandidatesCalled = false
    const outcome = await dispatchStoryClusteringDecision(
      {
        batchId,
        incomingItemId,
        loadCandidates: async () => {
          loadCandidatesCalled = true
          return [existingStoryCandidate(memberItemId, story.id)]
        },
      },
      { createClient: fake.createClient },
    )

    expect(loadCandidatesCalled).toBe(false)
    expect(fake.decide).not.toHaveBeenCalled()
    expect(outcome).toEqual({ kind: 'existing_story', storyId: story.id })
  })

  it('builds the structured-decision client with the C6 billing hooks wired', async () => {
    const candidateItemId = await makeItem('Candidate')
    const incomingItemId = await makeItem('Incoming article')
    const fake = createFakeStoryClusteringStructuredDecisionClient({
      choice: `rss_feed_item:${candidateItemId}`,
    })

    await dispatchStoryClusteringDecision(
      {
        batchId: randomUUID(),
        incomingItemId,
        loadCandidates: async () => [standaloneCandidate(candidateItemId)],
      },
      { createClient: fake.createClient },
    )

    expect(fake.createClient).toHaveBeenCalledOnce()
    const options = fake.createClient.mock.calls[0]?.[0]
    expect(options?.hooks?.beforeAttempt).toBeTypeOf('function')
    expect(options?.hooks?.onBilledResponse).toBeTypeOf('function')
    expect(options?.hooks?.onUnknownBilledAttempt).toBeTypeOf('function')
  })
})

describe('resolveStoryClusteringApiKey', () => {
  it('throws for a transport with no configured API key source', () => {
    expect(() => resolveStoryClusteringApiKey('typesafe')).toThrow(
      "Story clustering classifier dispatch has no API key source for provider 'typesafe'",
    )
  })
})
