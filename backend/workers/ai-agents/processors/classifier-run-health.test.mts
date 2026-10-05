import {
  CLASSIFIER_REQUEST_AGE_ALARM_MS,
  CLASSIFIER_RUN_AGE_ALARM_MS,
  CLASSIFIER_TERMINAL_FAILURE_ALARM_COUNT,
  CLASSIFIER_UNREQUESTED_GRACE_MS,
} from '@services/classifier-runs'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { createStoryClusteringRunAdapter } from '@services/stories'
import {
  createClassifierRunSweepScope,
  createHealthyClassifierRunHealth,
  POST_CLASSIFIER_SLUG,
} from '@voucha/test-helpers/classifier-run-worker'
import {
  createStoryClusteringItem,
  makeStoryClusteringVectors,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/story-clustering-fixture'
import { createSyntheticFixture } from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-classifier'
import {
  requestSyntheticRun,
  reserveEndedSyntheticRun,
  reserveSyntheticRun,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-run'
import { initializePostClassifierExecutionTests } from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  sentryCaptureExceptionMock,
  sentryCaptureMessageMock,
} from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { createClassifierRunHandler } from './classifier-run-handler.mts'
import { checkClassifierRunHealth, type ReadClassifierRunHealth } from './classifier-run-health.mts'
import { getClassifierRunHandler } from './classifier-run-registry.mts'
import { processReconcileClassifierRuns } from './process-reconcile-classifier-runs.mts'

const HOUR_MS = 60 * 60 * 1000
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR_MS)

const handlerFor = (adapter: Parameters<typeof createClassifierRunHandler>[0]['adapter']) =>
  createClassifierRunHandler({ adapter, execute: async () => 'persisted' })

/** The alarms of one kind raised for one classifier, which parallel tests never share. */
const alarmsOf = (kind: string, classifier: string) =>
  sentryCaptureMessageMock.mock.calls
    .filter(
      ([message, hint]) =>
        message === 'classifier_run_alarm' &&
        hint.tags.alarm_kind === kind &&
        hint.tags.classifier === classifier,
    )
    .map(([, hint]) => hint)

describe('classifier receipt health alarms: a stuck run or request (real PG)', () => {
  it('raises the age alarm for an incomplete run older than the threshold, and not before', async () => {
    const setup = await createSyntheticFixture()
    const run = await reserveSyntheticRun(setup)
    const handler = handlerFor(setup.adapter)

    await checkClassifierRunHealth([handler], new Date())
    expect(alarmsOf('run-age', setup.slug)).toHaveLength(0)

    await checkClassifierRunHealth([handler], inHours(27))

    const [alarm] = alarmsOf('run-age', setup.slug)
    expect(alarmsOf('run-age', setup.slug)).toHaveLength(1)
    expect(alarm).toMatchObject({
      level: 'error',
      fingerprint: ['classifier_run_alarm', 'run-age', setup.slug],
      tags: { reason: 'classifier_run_alarm', alarm_kind: 'run-age', classifier: setup.slug },
      extra: { runId: run.runId, thresholdMs: CLASSIFIER_RUN_AGE_ALARM_MS, incompleteRuns: 1 },
    })
    expect(alarm!.extra.oldestRunAgeMs).toBeGreaterThan(CLASSIFIER_RUN_AGE_ALARM_MS)
  })

  it('raises the age alarm for a request that never became a run', async () => {
    const setup = await createSyntheticFixture()
    await requestSyntheticRun(setup)
    const handler = handlerFor(setup.adapter)

    await checkClassifierRunHealth([handler], new Date())
    expect(alarmsOf('request-age', setup.slug)).toHaveLength(0)

    await checkClassifierRunHealth([handler], inHours(27))

    const [alarm] = alarmsOf('request-age', setup.slug)
    expect(alarm!.extra).toMatchObject({
      thresholdMs: CLASSIFIER_REQUEST_AGE_ALARM_MS,
      pendingRequests: 1,
    })
    expect(alarm!.extra.requestId).toEqual(expect.any(String))
    expect(alarmsOf('run-age', setup.slug)).toHaveLength(0)
  })
})

describe('classifier receipt health alarms: terminal failures (real PG)', () => {
  it('counts a missing key under its kind, and alarms once failures reach the threshold', async () => {
    const setup = await createSyntheticFixture()
    const handler = handlerFor(setup.adapter)
    const belowThreshold = CLASSIFIER_TERMINAL_FAILURE_ALARM_COUNT - 1
    for (let failure = 0; failure < belowThreshold; failure++) {
      await reserveEndedSyntheticRun(setup, failure === 0 ? 'client-unavailable' : 'provider-error')
    }

    await checkClassifierRunHealth([handler], new Date())
    expect(alarmsOf('terminal-failures', setup.slug)).toHaveLength(0)

    await reserveEndedSyntheticRun(setup, 'client-unavailable')
    await checkClassifierRunHealth([handler], new Date())

    const [alarm] = alarmsOf('terminal-failures', setup.slug)
    expect(alarm!.extra).toMatchObject({
      failedTotal: CLASSIFIER_TERMINAL_FAILURE_ALARM_COUNT,
      thresholdCount: CLASSIFIER_TERMINAL_FAILURE_ALARM_COUNT,
      completed: 0,
      failedByKind: {
        'client-unavailable': 2,
        'provider-error': CLASSIFIER_TERMINAL_FAILURE_ALARM_COUNT - 2,
      },
    })
  })
})

describe('classifier receipt health alarms: an eligible item nobody requested (real PG)', () => {
  it('reports a feed item with no request or run once its grace period has passed', async () => {
    const adapter = createStoryClusteringRunAdapter()
    const handler = handlerFor(adapter)
    const { unit } = makeStoryClusteringVectors()
    const lost = await createStoryClusteringItem({
      feedId: (await createTestRssFeed({})).id,
      embedding: unit,
    })
    const readHealth = (target: typeof handler, now: Date) =>
      target.health(now, { rssFeedItemIds: [lost.itemId] })

    await checkClassifierRunHealth([handler], new Date(), readHealth)
    expect(alarmsOf('subject-unrequested', adapter.slug)).toHaveLength(0)

    await checkClassifierRunHealth([handler], inHours(2), readHealth)

    const [alarm] = alarmsOf('subject-unrequested', adapter.slug)
    expect(alarm!.extra).toMatchObject({
      unrequestedSubjects: 1,
      graceMs: CLASSIFIER_UNREQUESTED_GRACE_MS,
    })
    expect(alarm!.extra.oldestUnrequestedAgeMs).toBeGreaterThan(CLASSIFIER_UNREQUESTED_GRACE_MS)
  })

  it('stops reporting an item once its run exists', async () => {
    const adapter = createStoryClusteringRunAdapter()
    const handler = handlerFor(adapter)
    const { unit, near } = makeStoryClusteringVectors()
    const feed = await createTestRssFeed({})
    const item = await createStoryClusteringItem({ feedId: feed.id, embedding: unit })
    await createStoryClusteringItem({ feedId: feed.id, embedding: near })
    await expect(handler.reserve(item.subject)).resolves.toMatchObject({ kind: 'reserved' })

    await checkClassifierRunHealth([handler], inHours(2), (target, now) =>
      target.health(now, { rssFeedItemIds: [item.itemId] }),
    )

    expect(alarmsOf('subject-unrequested', adapter.slug)).toHaveLength(0)
  })
})

describe('classifier receipt health alarms: the alarm payload and failures', () => {
  it('carries only identifiers, counts, ages and kinds', async () => {
    const setup = await createSyntheticFixture()
    await reserveSyntheticRun(setup)

    await checkClassifierRunHealth([handlerFor(setup.adapter)], inHours(27))

    const [alarm] = alarmsOf('run-age', setup.slug)
    expect(Object.keys(alarm!.extra).toSorted()).toEqual([
      'classifier',
      'incompleteRuns',
      'oldestRunAgeMs',
      'runId',
      'thresholdMs',
    ])
  })

  it('reports a classifier whose read failed and still alarms on the others', async () => {
    const stuck = await createSyntheticFixture()
    const broken = await createSyntheticFixture()
    await reserveSyntheticRun(stuck)
    const failure = new Error('health read failed')

    await checkClassifierRunHealth(
      [handlerFor(broken.adapter), handlerFor(stuck.adapter)],
      inHours(27),
      (target, now) => (target.slug === broken.slug ? Promise.reject(failure) : target.health(now)),
    )

    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(failure, expect.anything())
    expect(alarmsOf('run-age', stuck.slug)).toHaveLength(1)
    expect(alarmsOf('run-age', broken.slug)).toHaveLength(0)
  })

  it('stays quiet for a classifier with nothing to report', async () => {
    const setup = await createSyntheticFixture()

    await checkClassifierRunHealth([handlerFor(setup.adapter)], inHours(27), async target =>
      createHealthyClassifierRunHealth(target.slug),
    )

    expect(sentryCaptureMessageMock).not.toHaveBeenCalled()
  })
})

describe('classifier receipt health alarms: the scheduled recovery tick (real PG)', () => {
  const scope = createClassifierRunSweepScope(getClassifierRunHandler(POST_CLASSIFIER_SLUG))
  const readHealth = vi.fn<ReadClassifierRunHealth>(async handler =>
    createHealthyClassifierRunHealth(handler.slug),
  )
  const tick = (data = {}, overrides = {}) =>
    processReconcileClassifierRuns(data, scope.dependencies({ readHealth, ...overrides }))
  const breached = {
    evaluateSpendCap: async () => ({
      reason: 'cap_exceeded' as const,
      dailyCapMicrounits: 1,
      day: '2026-09-30',
      totalMicrounits: 2,
    }),
  }

  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  beforeEach(() => {
    scope.reset()
    readHealth.mockClear()
  })
  afterAll(async () => release?.())

  it('reads every classifier once on the scheduled tick', async () => {
    await tick()

    expect(readHealth).toHaveBeenCalledExactlyOnceWith(scope.handler, expect.any(Date))
  })

  it('still reads it while the spend cap parks the queue, so a parked backlog is seen', async () => {
    await expect(tick({}, breached)).resolves.toEqual({ kind: 'spend-cap-breach' })

    expect(readHealth).toHaveBeenCalledOnce()
  })

  it('leaves the chained pages of a sweep alone, so one tick alarms once', async () => {
    await tick({ phase: 'requests', classifier: POST_CLASSIFIER_SLUG })
    await tick({ phase: 'incomplete', after: null })

    expect(readHealth).not.toHaveBeenCalled()
  })

  it('alarms from the tick on a stuck classifier and still runs the sweep', async () => {
    const stuck: ReadClassifierRunHealth = async handler => ({
      ...createHealthyClassifierRunHealth(handler.slug),
      oldestIncompleteRun: { id: 'run-1', ageMs: CLASSIFIER_RUN_AGE_ALARM_MS + 1, total: 1 },
    })

    await expect(tick({}, { readHealth: stuck })).resolves.toMatchObject({ kind: 'incomplete' })

    expect(alarmsOf('run-age', POST_CLASSIFIER_SLUG)).toHaveLength(1)
  })

  it('does not let a failed health read stop the sweep', async () => {
    const broken: ReadClassifierRunHealth = async () => {
      throw new Error('health read failed')
    }

    await expect(tick({}, { readHealth: broken })).resolves.toMatchObject({ kind: 'incomplete' })
  })
})
