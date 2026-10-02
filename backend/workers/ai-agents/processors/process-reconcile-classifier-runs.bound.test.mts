import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createClassifierRunSweepScope,
  dispatchApprovedClassifierPost,
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
import { initializePostClassifierExecutionTests } from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import { CLASSIFIER_RUN_SWEEP_ENQUEUE_BOUND as BOUND } from '@services/classifier-runs'
import { sentryCaptureMessageMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { getClassifierRunHandler } from './classifier-run-registry.mts'
import { processReconcileClassifierRuns } from './process-reconcile-classifier-runs.mts'

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

describe('classifier run recovery sweep: the bound alarm', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  beforeEach(() => scope.reset())
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

    // The terminal counts show the looped receipt under its own failure kind.
    const { terminal } = await getClassifierRunHandler(POST_CLASSIFIER_SLUG).health(new Date())
    expect(terminal.failed['sweep-bound-exceeded']).toBeGreaterThanOrEqual(1)
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
})
