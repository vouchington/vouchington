import { createAutotaggerRunAdapter } from '../autotagger/index.mts'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { createStoryClusteringRunAdapter } from '../stories/index.mts'
import {
  getSubjectClassifierRunRequestFacts,
  markClassifierRunTerminalForTest,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { softDeleteRssFeedItemForTest } from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-edits'
import {
  createStoryClusteringItem,
  makeStoryClusteringVectors,
  requestFeedItemClassifierRuns,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-fixture'
import {
  createSyntheticFixture,
  reviseSyntheticPost,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-classifier'
import {
  overNewSyntheticPost,
  requestSyntheticRun,
  reserveCompletedSyntheticRun,
  reserveEndedSyntheticRun,
  reserveSyntheticRun,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-run'
import { describe, expect, it } from 'vitest'
import { reserveClassifierRun } from './run-reservation.mts'
import { supersedeStaleClassifierRun } from './run-supersession.mts'
import type { ClassifierRunAdapter } from './types.mts'
import {
  CLASSIFIER_REQUEST_AGE_ALARM_MS,
  CLASSIFIER_RUN_AGE_ALARM_MS,
  CLASSIFIER_TERMINAL_WINDOW_MS,
  CLASSIFIER_UNREQUESTED_GRACE_MS,
} from './health-thresholds.mts'
import { readClassifierRunHealth } from './health.mts'

const HOUR_MS = 60 * 60 * 1000
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR_MS)

describe('classifier run health: the oldest incomplete run (real PG)', () => {
  it('is the first run that can still finish, counted with every other', async () => {
    const setup = await createSyntheticFixture()
    const first = await reserveSyntheticRun(setup)
    await reserveSyntheticRun(await overNewSyntheticPost(setup))

    const fresh = await readClassifierRunHealth(setup.adapter, new Date())
    expect(fresh.oldestIncompleteRun).toMatchObject({ id: first.runId, total: 2 })
    expect(fresh.oldestIncompleteRun!.ageMs).toBeLessThan(60_000)

    const stuck = await readClassifierRunHealth(setup.adapter, inHours(27))
    expect(stuck.oldestIncompleteRun).toMatchObject({ id: first.runId, total: 2 })
    expect(stuck.oldestIncompleteRun!.ageMs).toBeGreaterThan(CLASSIFIER_RUN_AGE_ALARM_MS)
  })

  it('skips complete, superseded and terminal runs, and is null once none remains', async () => {
    const setup = await createSyntheticFixture()
    await reserveCompletedSyntheticRun(setup)
    await reserveEndedSyntheticRun(setup, 'provider-error')
    await requestSyntheticRun(setup)
    const replaced = await reserveSyntheticRun(setup)
    await requestSyntheticRun(setup, await reviseSyntheticPost(setup.post.id))
    const replacement = await supersedeStaleClassifierRun(setup.adapter, replaced)

    const health = await readClassifierRunHealth(setup.adapter, inHours(27))

    expect(health.oldestIncompleteRun).toMatchObject({ id: replacement!.runId, total: 1 })
    await markClassifierRunTerminalForTest(replacement!.runId, 'attempts-exhausted')
    const none = await readClassifierRunHealth(setup.adapter, inHours(27))
    expect(none.oldestIncompleteRun).toBeNull()
  })

  it("does not see another classifier's runs", async () => {
    const setup = await createSyntheticFixture()
    await reserveSyntheticRun(await createSyntheticFixture())

    const health = await readClassifierRunHealth(setup.adapter, inHours(27))

    expect(health.oldestIncompleteRun).toBeNull()
  })
})

describe('classifier run health: the oldest pending request (real PG)', () => {
  it('is a request that never became a run, until a run ends its wait', async () => {
    const setup = await createSyntheticFixture()
    await requestSyntheticRun(setup)
    const [request] = await getSubjectClassifierRunRequestFacts(setup.subject, setup.slug)

    const stuck = await readClassifierRunHealth(setup.adapter, inHours(27))
    expect(stuck.oldestPendingRequest).toMatchObject({ id: request!.id, total: 1 })
    expect(stuck.oldestPendingRequest!.ageMs).toBeGreaterThan(CLASSIFIER_REQUEST_AGE_ALARM_MS)

    await reserveSyntheticRun(setup)
    const reserved = await readClassifierRunHealth(setup.adapter, inHours(27))
    expect(reserved.oldestPendingRequest).toBeNull()
  })

  it('does not count a request that settled as no work', async () => {
    const setup = await createSyntheticFixture()
    setup.state.configured = false
    await requestSyntheticRun(setup)
    await reserveClassifierRun(setup.adapter, setup.subject)

    const health = await readClassifierRunHealth(setup.adapter, inHours(27))

    expect(health.oldestPendingRequest).toBeNull()
  })
})

describe('classifier run health: terminal counts (real PG)', () => {
  it('counts recent runs by how they ended and by failure kind, missing key included', async () => {
    const setup = await createSyntheticFixture()
    await reserveCompletedSyntheticRun(setup)
    await reserveEndedSyntheticRun(setup, 'client-unavailable')
    await reserveEndedSyntheticRun(setup, 'provider-error')
    await reserveEndedSyntheticRun(setup, 'provider-error')
    await reserveSyntheticRun(setup)

    const { terminal } = await readClassifierRunHealth(setup.adapter, new Date())

    expect(terminal).toEqual({
      completed: 1,
      superseded: 0,
      incomplete: 1,
      failed: { 'client-unavailable': 1, 'provider-error': 2 },
      failedTotal: 3,
    })
  })

  it('counts a superseded run as superseded, not as a failure', async () => {
    const setup = await createSyntheticFixture()
    await requestSyntheticRun(setup)
    const replaced = await reserveSyntheticRun(setup)
    await requestSyntheticRun(setup, await reviseSyntheticPost(setup.post.id))
    await supersedeStaleClassifierRun(setup.adapter, replaced)

    const { terminal } = await readClassifierRunHealth(setup.adapter, new Date())

    expect(terminal).toMatchObject({ superseded: 1, incomplete: 1, failedTotal: 0 })
  })

  it('counts runs reserved inside the window only', async () => {
    const setup = await createSyntheticFixture()
    await reserveEndedSyntheticRun(setup, 'sweep-bound-exceeded')

    const inside = await readClassifierRunHealth(setup.adapter, inHours(1))
    const outside = await readClassifierRunHealth(
      setup.adapter,
      new Date(Date.now() + CLASSIFIER_TERMINAL_WINDOW_MS + HOUR_MS),
    )

    expect(inside.terminal.failed).toEqual({ 'sweep-bound-exceeded': 1 })
    expect(outside.terminal).toEqual({
      completed: 0,
      superseded: 0,
      incomplete: 0,
      failed: {},
      failedTotal: 0,
    })
  })
})

describe('classifier run health: eligible feed items with no request (real PG)', () => {
  async function feedItems() {
    const feed = await createTestRssFeed({})
    const { unit } = makeStoryClusteringVectors()
    const embedded = () => createStoryClusteringItem({ feedId: feed.id, embedding: unit })
    return {
      lost: await embedded(),
      requested: await embedded(),
      unembedded: await createStoryClusteringItem({ feedId: feed.id }),
      deleted: await embedded(),
    }
  }
  type Items = Awaited<ReturnType<typeof feedItems>>

  const scopeOf = (items: Items) => ({
    rssFeedItemIds: Object.values(items).map(item => item.itemId),
  })

  async function healthWithOneLostItem<C, L, E>(adapter: ClassifierRunAdapter<C, L, E>) {
    const items = await feedItems()
    await requestFeedItemClassifierRuns(items.requested, [adapter.slug])
    await softDeleteRssFeedItemForTest(items.deleted.itemId)

    return readClassifierRunHealth(adapter, inHours(2), scopeOf(items))
  }

  it('reports a story clustering item no producer requested, and only that one', async () => {
    const health = await healthWithOneLostItem(createStoryClusteringRunAdapter())

    expect(health.unrequestedFeedItems?.total).toBe(1)
  })

  it('reports a tagging item no producer requested, and only that one', async () => {
    const health = await healthWithOneLostItem(createAutotaggerRunAdapter())

    expect(health.unrequestedFeedItems?.total).toBe(1)
  })

  it('does not report an item whose run exists', async () => {
    const adapter = createStoryClusteringRunAdapter()
    const items = await feedItems()
    await expect(reserveClassifierRun(adapter, items.lost.subject)).resolves.toMatchObject({
      kind: 'reserved',
    })
    await softDeleteRssFeedItemForTest(items.requested.itemId)
    await softDeleteRssFeedItemForTest(items.deleted.itemId)

    const health = await readClassifierRunHealth(adapter, inHours(2), scopeOf(items))

    expect(health.unrequestedFeedItems).toEqual({ total: 0, oldestAgeMs: 0 })
  })

  it('waits out the grace period so an item still being written is not reported', async () => {
    const adapter = createStoryClusteringRunAdapter()
    const items = await feedItems()
    const scope = { rssFeedItemIds: [items.lost.itemId] }

    const early = await readClassifierRunHealth(adapter, new Date(), scope)
    const late = await readClassifierRunHealth(adapter, inHours(2), scope)

    expect(early.unrequestedFeedItems).toEqual({ total: 0, oldestAgeMs: 0 })
    expect(late.unrequestedFeedItems?.total).toBe(1)
    expect(late.unrequestedFeedItems!.oldestAgeMs).toBeGreaterThan(CLASSIFIER_UNREQUESTED_GRACE_MS)
  })

  it('is not asked of a classifier whose producers do not cover every item', async () => {
    const setup = await createSyntheticFixture()

    const health = await readClassifierRunHealth(setup.adapter, inHours(2))

    expect(health.unrequestedFeedItems).toBeNull()
  })
})
