import { reserveClassifierRun, supersedeStaleClassifierRun } from '@services/classifier-runs'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { insertTestStory, setTestItemStoryId } from '@voucha/test-helpers'
import { changeConfigurationAfterFirstResolve } from '@voucha/test-helpers/data-stores/psql/classifier-runs/altered-configuration'
import {
  observeCandidateCaptureLock,
  probeClassifierSubjectLockWhileHeld,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/lock-probe'
import {
  getSubjectClassifierRunFacts,
  getSubjectClassifierRunRequestFacts,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { reviseAndEmbedStoryClusteringItem } from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-edits'
import {
  createStoryClusteringItem,
  makeStoryClusteringVectors,
  readStoryRunCandidates,
  requestStoryClusteringRun,
  reserveStoryClusteringRun,
  STORY_CLUSTERING_CLASSIFIER_SLUG,
  type StoryClusteringItem,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-fixture'
import { describe, expect, it } from 'vitest'
import { createStoryClusteringRunAdapter } from '../adapter.mts'

const adapter = createStoryClusteringRunAdapter()

/** An embedded item with one nearby standalone neighbor, and its request. */
async function createItemWithNeighbor() {
  const { unit, near } = makeStoryClusteringVectors()
  const feed = await createTestRssFeed({})
  const neighbor = await createStoryClusteringItem({ feedId: feed.id, embedding: near })
  const item = await createStoryClusteringItem({ feedId: feed.id, embedding: unit })
  await requestStoryClusteringRun(item)
  return { item, neighbor, feed }
}

function reserved(result: Awaited<ReturnType<typeof reserveClassifierRun>>) {
  if (result.kind !== 'reserved') throw new Error(`Expected a reservation, got ${result.kind}`)
  return result.run
}

async function requestFacts(item: StoryClusteringItem) {
  return getSubjectClassifierRunRequestFacts(item.subject, STORY_CLUSTERING_CLASSIFIER_SLUG)
}

describe('story clustering reservation lock scope (real PG)', () => {
  it('detects a held subject lock, so a free reading means something', async () => {
    const { item } = await createItemWithNeighbor()

    expect(await probeClassifierSubjectLockWhileHeld(adapter, item.subject)).toBe('held')
  })

  it('searches the stories and standalone items with no lock held, then reserves them', async () => {
    const { unit, at } = makeStoryClusteringVectors()
    const feed = await createTestRssFeed({})
    const standalone = await createStoryClusteringItem({ feedId: feed.id, embedding: at(0.95) })
    const member = await createStoryClusteringItem({ feedId: feed.id, embedding: at(0.9) })
    const story = await insertTestStory()
    await setTestItemStoryId(member.itemId, story.id)
    const item = await createStoryClusteringItem({ feedId: feed.id, embedding: unit })
    await requestStoryClusteringRun(item)
    const observed: Array<'free' | 'held'> = []

    const run = reserved(
      await reserveClassifierRun(observeCandidateCaptureLock(adapter, observed), item.subject),
    )

    expect(observed).toEqual(['free'])
    expect(await readStoryRunCandidates(run.runId)).toEqual([
      { rssFeedItemId: standalone.itemId },
      { storyId: story.id },
    ])
  })

  it('searches again against the new content when the item changes during the search', async () => {
    const { item, neighbor } = await createItemWithNeighbor()
    const observed: Array<'free' | 'held'> = []
    let revised = false

    const run = reserved(
      await reserveClassifierRun(
        observeCandidateCaptureLock(adapter, observed, async () => {
          if (revised) return
          revised = true
          await reviseAndEmbedStoryClusteringItem(item.itemId)
        }),
        item.subject,
      ),
    )

    expect(observed).toEqual(['free', 'free'])
    expect(run.inputSha256.equals(item.inputSha256)).toBe(false)
    expect((await getSubjectClassifierRunFacts(item.subject)).map(fact => fact.id)).toEqual([
      run.runId,
    ])
    expect(await readStoryRunCandidates(run.runId)).toEqual([{ rssFeedItemId: neighbor.itemId }])
  })

  it('searches again against the new configuration when it changes during the search', async () => {
    const { item } = await createItemWithNeighbor()
    const observed: Array<'free' | 'held'> = []

    const run = reserved(
      await reserveClassifierRun(
        observeCandidateCaptureLock(changeConfigurationAfterFirstResolve(adapter), observed),
        item.subject,
      ),
    )

    expect(observed).toEqual(['free', 'free'])
    expect((await getSubjectClassifierRunFacts(item.subject)).map(fact => fact.id)).toEqual([
      run.runId,
    ])
  })

  it('gives up as not ready after three searches against a changing item and reserves nothing', async () => {
    const { item } = await createItemWithNeighbor()
    const observed: Array<'free' | 'held'> = []

    const result = await reserveClassifierRun(
      observeCandidateCaptureLock(adapter, observed, async () => {
        await reviseAndEmbedStoryClusteringItem(item.itemId)
      }),
      item.subject,
    )

    expect(result).toEqual({ kind: 'not-ready' })
    expect(observed).toEqual(['free', 'free', 'free'])
    expect(await getSubjectClassifierRunFacts(item.subject)).toEqual([])
    const [request] = await requestFacts(item)
    expect([request?.run_id, request?.no_work_at, request?.stale_at]).toEqual([null, null, null])
  })

  it('searches a replacement’s candidates with no lock held when it supersedes a stale run', async () => {
    const { item } = await createItemWithNeighbor()
    const stale = await reserveStoryClusteringRun(item)
    await reviseAndEmbedStoryClusteringItem(item.itemId)
    const observed: Array<'free' | 'held'> = []

    const replacement = await supersedeStaleClassifierRun(
      observeCandidateCaptureLock(adapter, observed),
      stale,
    )

    expect(observed).toEqual(['free'])
    expect(replacement).not.toBeNull()
    expect(replacement!.runId).not.toBe(stale.runId)
    expect(replacement!.inputSha256.equals(stale.inputSha256)).toBe(false)
  })
})
