import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createClassifierRunSweepScope,
  dispatchApprovedClassifierPost,
  requestPostClassifierRun,
  POST_CLASSIFIER_SLUG,
} from '@voucha/test-helpers/classifier-run-worker'
import {
  readClassifierRunJobsForTest,
  removeClassifierRunJobForTest,
} from '@voucha/test-helpers/classifier-run-queue-jobs'
import {
  getClassifierRunFacts,
  setClassifierRunSweepEnqueueCountForTest,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import {
  createApprovedClassifierPost,
  initializePostClassifierExecutionTests,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import { CLASSIFIER_RUN_SWEEP_ENQUEUE_BOUND as BOUND } from '@services/classifier-runs'
import { sentryCaptureMessageMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { getClassifierRunHandler } from './classifier-run-registry.mts'
import {
  CLASSIFIER_RUN_AGE_ALARM_MS,
  processReconcileClassifierRuns,
} from './process-reconcile-classifier-runs.mts'

const scope = createClassifierRunSweepScope(getClassifierRunHandler(POST_CLASSIFIER_SLUG))
const sweep = (data = {}) => processReconcileClassifierRuns(data, scope.dependencies())

async function dispatchTracked(remote: boolean) {
  const dispatched = await dispatchApprovedClassifierPost(remote)
  scope.track(dispatched.post, dispatched.runId)
  return dispatched
}

const runFacts = async (postId: string) =>
  (await getClassifierRunFacts(postId, POST_CLASSIFIER_SLUG))[0]!

const alarmsOf = (kind: string, id?: string) =>
  sentryCaptureMessageMock.mock.calls.filter(
    ([message, hint]) =>
      message === 'classifier_run_alarm' &&
      hint.tags.alarm_kind === kind &&
      (id === undefined || hint.extra.runId === id || hint.extra.requestId === id),
  )

describe('classifier run recovery sweep: bound and age alarms', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  beforeEach(() => scope.reset())
  afterEach(() => vi.useRealTimers())
  afterAll(async () => release?.())

  it('counts only enqueues that add a job and ends the run once the bound is spent', async () => {
    const run = await dispatchTracked(true)

    for (let enqueue = 1; enqueue <= BOUND; enqueue++) {
      removeClassifierRunJobForTest(run.runId)
      await sweep()
      await sweep()
      expect((await runFacts(run.post.id)).sweep_enqueue_count).toBe(enqueue)
      expect(await readClassifierRunJobsForTest(run.runId)).toHaveLength(1)
    }

    // Its last permitted job is still queued (for example parked by the spend cap): no give-up.
    expect(await runFacts(run.post.id)).toMatchObject({
      sweep_enqueue_count: BOUND,
      terminal_failure_kind: null,
    })
    expect(alarmsOf('sweep-bound-exceeded', run.runId)).toHaveLength(0)

    removeClassifierRunJobForTest(run.runId)
    await expect(sweep()).resolves.toMatchObject({ abandoned: 1 })

    expect(await runFacts(run.post.id)).toMatchObject({
      sweep_enqueue_count: BOUND + 1,
      terminal_failure_kind: 'sweep-bound-exceeded',
      terminal_failed_at: expect.any(Date),
      lease_token: null,
      completed_at: null,
    })
    const [alarm] = alarmsOf('sweep-bound-exceeded', run.runId)
    expect(alarm?.[1].extra).toMatchObject({
      sweepEnqueueCount: BOUND,
      classifier: 'post-classifier',
    })

    await sweep()
    expect(await readClassifierRunJobsForTest(run.runId)).toHaveLength(0)
    expect((await runFacts(run.post.id)).sweep_enqueue_count).toBe(BOUND + 1)
    expect(alarmsOf('sweep-bound-exceeded', run.runId)).toHaveLength(1)
  })

  it('gives up a local-only run at the bound like any other', async () => {
    const run = await dispatchTracked(false)
    await setClassifierRunSweepEnqueueCountForTest(run.runId, BOUND)
    removeClassifierRunJobForTest(run.runId)

    await sweep()

    expect(await runFacts(run.post.id)).toMatchObject({
      sweep_enqueue_count: BOUND + 1,
      terminal_failure_kind: 'sweep-bound-exceeded',
      completed_at: null,
    })
    await sweep()
    expect(await readClassifierRunJobsForTest(run.runId)).toHaveLength(0)
  })

  it('alarms once the oldest in-flight run outlives the longest legitimate delay', async () => {
    const run = await dispatchTracked(true)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + CLASSIFIER_RUN_AGE_ALARM_MS + 60 * 60 * 1000)

    await sweep()

    const alarms = alarmsOf('run-age')
    expect(alarms).toHaveLength(1)
    expect(alarms[0]?.[1].extra).toMatchObject({
      runId: run.runId,
      thresholdMs: CLASSIFIER_RUN_AGE_ALARM_MS,
      oldestRunAgeMs: expect.any(Number),
    })
    expect(alarms[0]?.[1].extra.oldestRunAgeMs).toBeGreaterThan(CLASSIFIER_RUN_AGE_ALARM_MS)
  })

  it('alarms once an eligible subject has waited too long for a run', async () => {
    const { post, inputSha256 } = await createApprovedClassifierPost(true, true)
    scope.postIds.add(post.id)
    await requestPostClassifierRun(post, inputSha256)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + CLASSIFIER_RUN_AGE_ALARM_MS + 60 * 60 * 1000)

    await sweep({ phase: 'requests', classifier: POST_CLASSIFIER_SLUG })

    const alarms = alarmsOf('request-age')
    expect(alarms).toHaveLength(1)
    expect(alarms[0]?.[1].extra).toMatchObject({ thresholdMs: CLASSIFIER_RUN_AGE_ALARM_MS })
  })

  it('raises no age alarm for work inside that window', async () => {
    await dispatchTracked(true)
    const { post, inputSha256 } = await createApprovedClassifierPost(true, true)
    scope.postIds.add(post.id)
    await requestPostClassifierRun(post, inputSha256)

    await sweep()
    await sweep({ phase: 'requests', classifier: POST_CLASSIFIER_SLUG })

    expect(alarmsOf('run-age')).toHaveLength(0)
    expect(alarmsOf('request-age')).toHaveLength(0)
  })
})
