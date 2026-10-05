import type { QueryExecutor } from '@data-stores/psql'
import { listPendingClassifierRunRequests, reserveClassifierRun } from '@services/classifier-runs'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import {
  createStoryClusteringItem,
  makeStoryClusteringVectors,
  readStoryRunCandidates,
  requestStoryClusteringRun,
  reserveStoryClusteringRun,
  STORY_CLUSTERING_CLASSIFIER_SLUG,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-fixture'
import { softDeleteRssFeedItemForTest } from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-edits'
import { embedAutotaggerFeedItem } from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import {
  getSubjectClassifierRunFacts,
  getSubjectClassifierRunRequestFacts,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { describe, expect, it } from 'vitest'
import { createStoryClusteringRunAdapter } from './adapter.mts'
import { resolveStoryClusteringRunConfiguration } from './configuration.mts'

const adapter = createStoryClusteringRunAdapter()

/** A database with no active classifier row, so the seeded configuration reads as missing. */
const withoutClassifier: QueryExecutor = async () => ({
  command: 'SELECT',
  fields: [],
  oid: 0,
  rowCount: 0,
  rows: [],
})

/** Every item id with a request the sweep would dispatch now, drained across pages. */
async function sweepableItemIds(after: string | null = null): Promise<string[]> {
  const page = await listPendingClassifierRunRequests(adapter, after)
  const ids = page.items.map(item => item.rssFeedItemId ?? '')
  return page.next ? [...ids, ...(await sweepableItemIds(page.next))] : ids
}

describe('story clustering run reservation (real PG)', () => {
  it('reserves one receipt per item content and captures its candidates with it', async () => {
    const { unit, near } = makeStoryClusteringVectors()
    const feed = await createTestRssFeed({})
    const neighbor = await createStoryClusteringItem({ feedId: feed.id, embedding: near })
    const item = await createStoryClusteringItem({ feedId: feed.id, embedding: unit })

    const run = await reserveStoryClusteringRun(item)

    const [receipt] = await getSubjectClassifierRunFacts(
      item.subject,
      STORY_CLUSTERING_CLASSIFIER_SLUG,
    )
    expect(receipt).toMatchObject({
      id: run.runId,
      post_id: null,
      rss_feed_item_id: item.itemId,
      decision_batch_id: expect.any(String),
      provider_attempts_started: 0,
      completed_at: null,
    })
    expect(receipt!.input_sha256.equals(item.inputSha256)).toBe(true)
    expect(await readStoryRunCandidates(run.runId)).toEqual([{ rssFeedItemId: neighbor.itemId }])
    expect(await getSubjectClassifierRunRequestFacts(item.subject)).toMatchObject([
      { run_id: run.runId, no_work_at: null, stale_at: null },
    ])
  })

  it('never lets a changed neighbor set mint a second receipt or change what the receipt asks', async () => {
    const { unit, near, at } = makeStoryClusteringVectors()
    const feed = await createTestRssFeed({})
    const first = await createStoryClusteringItem({ feedId: feed.id, embedding: near })
    const item = await createStoryClusteringItem({ feedId: feed.id, embedding: unit })
    const run = await reserveStoryClusteringRun(item)
    await createStoryClusteringItem({ feedId: feed.id, embedding: at(0.99) })

    const again = await reserveClassifierRun(adapter, item.subject)

    expect(again).toMatchObject({ kind: 'reserved', run: { runId: run.runId } })
    expect(await readStoryRunCandidates(run.runId)).toEqual([{ rssFeedItemId: first.itemId }])
    expect(
      await getSubjectClassifierRunFacts(item.subject, STORY_CLUSTERING_CLASSIFIER_SLUG),
    ).toHaveLength(1)
  })

  it('settles an item with no neighbor as no work and reserves nothing', async () => {
    const { unit } = makeStoryClusteringVectors()
    const feed = await createTestRssFeed({})
    const item = await createStoryClusteringItem({ feedId: feed.id, embedding: unit })
    await requestStoryClusteringRun(item)

    expect(await reserveClassifierRun(adapter, item.subject)).toEqual({ kind: 'no-work' })

    expect(
      await getSubjectClassifierRunFacts(item.subject, STORY_CLUSTERING_CLASSIFIER_SLUG),
    ).toEqual([])
    expect(await getSubjectClassifierRunRequestFacts(item.subject)).toMatchObject([
      { run_id: null, no_work_at: expect.any(Date) },
    ])
  })

  it('leaves the request pending until the item is embedded, then reserves it', async () => {
    const { unit, near } = makeStoryClusteringVectors()
    const feed = await createTestRssFeed({})
    await createStoryClusteringItem({ feedId: feed.id, embedding: near })
    const item = await createStoryClusteringItem({ feedId: feed.id })
    await requestStoryClusteringRun(item)

    expect(await reserveClassifierRun(adapter, item.subject)).toEqual({ kind: 'not-ready' })

    expect(await getSubjectClassifierRunRequestFacts(item.subject)).toMatchObject([
      { run_id: null, no_work_at: null, stale_at: null },
    ])
    await embedAutotaggerFeedItem(item.itemId, unit)
    expect((await reserveClassifierRun(adapter, item.subject)).kind).toBe('reserved')
  })

  it('settles an item deleted after the request as stale', async () => {
    const { unit, near } = makeStoryClusteringVectors()
    const feed = await createTestRssFeed({})
    await createStoryClusteringItem({ feedId: feed.id, embedding: near })
    const item = await createStoryClusteringItem({ feedId: feed.id, embedding: unit })
    await requestStoryClusteringRun(item)
    await softDeleteRssFeedItemForTest(item.itemId)

    expect(await reserveClassifierRun(adapter, item.subject)).toEqual({ kind: 'stale' })
  })
})

describe('story clustering sweep eligibility (real PG)', () => {
  it('holds an item back until its embedding exists, without burning a sweep enqueue', async () => {
    const { unit } = makeStoryClusteringVectors()
    const feed = await createTestRssFeed({})
    const waiting = await createStoryClusteringItem({ feedId: feed.id })
    const ready = await createStoryClusteringItem({ feedId: feed.id, embedding: unit })
    await Promise.all([requestStoryClusteringRun(waiting), requestStoryClusteringRun(ready)])

    const before = await sweepableItemIds()
    await embedAutotaggerFeedItem(waiting.itemId, unit)
    const after = await sweepableItemIds()

    expect(before).toContain(ready.itemId)
    expect(before).not.toContain(waiting.itemId)
    expect(after).toContain(waiting.itemId)
  })

  it('never discovers an item that no one requested', async () => {
    const { unit } = makeStoryClusteringVectors()
    const feed = await createTestRssFeed({})
    const item = await createStoryClusteringItem({ feedId: feed.id, embedding: unit })

    expect(await sweepableItemIds()).not.toContain(item.itemId)
  })
})

describe('story clustering run configuration (real PG)', () => {
  it('pins the active prompt, model and shared actor, but never the candidates or thresholds', async () => {
    const resolved = await resolveStoryClusteringRunConfiguration()

    expect(resolved.configuration).toMatchObject({
      revision: 1,
      actorId: resolved.actorId,
      classifierId: expect.any(String),
      promptVersionId: expect.any(String),
      modelProvider: 'openrouter',
    })
    expect(Object.keys(resolved.configuration).toSorted()).toEqual([
      'actorId',
      'classifierId',
      'modelName',
      'modelProvider',
      'prompt',
      'promptVersionId',
      'revision',
    ])
    expect(resolved.remote).toMatchObject({
      scope: { scopeCategory: 'global', scopeCommunityId: null },
      candidateKind: 'story',
    })
    expect(JSON.parse(resolved.configurationJson)).toEqual(resolved.configuration)
  })

  it('throws for a missing classifier, so the request stays for the sweep instead of settling', async () => {
    await expect(resolveStoryClusteringRunConfiguration(withoutClassifier)).rejects.toThrow(
      `Classifier configuration for slug '${STORY_CLUSTERING_CLASSIFIER_SLUG}' not found`,
    )
  })

  it('keeps the request pending when configuration is unresolvable, and reserves once it is back', async () => {
    const { unit, near } = makeStoryClusteringVectors()
    const feed = await createTestRssFeed({})
    await createStoryClusteringItem({ feedId: feed.id, embedding: near })
    const item = await createStoryClusteringItem({ feedId: feed.id, embedding: unit })
    await requestStoryClusteringRun(item)
    const unresolvable = {
      ...adapter,
      resolve: () => resolveStoryClusteringRunConfiguration(withoutClassifier),
    }

    await expect(reserveClassifierRun(unresolvable, item.subject)).rejects.toThrow('not found')

    expect(await getSubjectClassifierRunRequestFacts(item.subject)).toMatchObject([
      { run_id: null, no_work_at: null, stale_at: null },
    ])
    expect((await reserveClassifierRun(adapter, item.subject)).kind).toBe('reserved')
  })
})
