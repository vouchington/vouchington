import { randomUUID } from 'node:crypto'
import detectorPackage from '@jongleberry/vurst-ai/package.json' with { type: 'json' }
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import {
  classifierRunDispatcherJobFor,
  classifierRunJobFor,
  createClassifierRunSweepScope,
  dispatchApprovedClassifierPost,
  requestPostClassifierRun,
  POST_CLASSIFIER_SLUG,
} from '@voucha/test-helpers/classifier-run-worker'
import {
  readClassifierRunDispatcherJobsForTest,
  readClassifierRunJobsForTest,
  removeClassifierRunJobForTest,
} from '@voucha/test-helpers/classifier-run-queue-jobs'
import {
  expireClassifierRunLeaseForTest,
  getClassifierRunFacts,
  markClassifierRunTerminalForTest,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import {
  createApprovedClassifierPost,
  initializePostClassifierExecutionTests,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import { getPostClassifierLocalOutcomeFacts } from '@voucha/test-helpers/data-stores/psql/post-classifier/run-facts'
import { ai_agents } from '@queues/ai-agents/queues'
import { claimClassifierRun, startClassifierProviderAttempt } from '@services/classifier-runs'
import { createPostClassifierRunAdapter } from '@services/post-classifier'
import { sentryCaptureMessageMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { getClassifierRunHandler } from './classifier-run-registry.mts'
import { processClassifierRun, processClassifierRunDispatcher } from './process-classifier-run.mts'
import { processReconcileClassifierRuns } from './process-reconcile-classifier-runs.mts'

const scope = createClassifierRunSweepScope(getClassifierRunHandler(POST_CLASSIFIER_SLUG))
const sweep = (data = {}, overrides = {}, pageSize = 500) =>
  processReconcileClassifierRuns(data, scope.dependencies(overrides, pageSize))

async function dispatchTracked(remote: boolean) {
  const dispatched = await dispatchApprovedClassifierPost(remote)
  scope.track(dispatched.post, dispatched.runId)
  return dispatched
}

const runFacts = async (postId: string) =>
  (await getClassifierRunFacts(postId, POST_CLASSIFIER_SLUG))[0]!
const requests = { phase: 'requests', classifier: POST_CLASSIFIER_SLUG } as const
const noRequests = { kind: 'requests', dispatched: 0, hasNext: false }

describe('classifier run recovery sweep: request discovery', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  beforeEach(() => scope.reset())
  afterAll(async () => release?.())

  it('dispatches an approved post that never got a run, once, however many sweeps overlap', async () => {
    const { post, inputSha256 } = await createApprovedClassifierPost(true, true)
    scope.postIds.add(post.id)
    await requestPostClassifierRun(post, inputSha256)

    await expect(sweep(requests)).resolves.toEqual({ ...noRequests, dispatched: 1 })
    await sweep(requests)

    expect(await readClassifierRunDispatcherJobsForTest(post.id)).toHaveLength(1)
    expect(await getClassifierRunFacts(post.id)).toEqual([])
  })

  it('recovers an approval whose first dispatcher enqueue was lost, with one run however it retries', async () => {
    const { post, inputSha256 } = await createApprovedClassifierPost(true, true)
    scope.postIds.add(post.id)
    await requestPostClassifierRun(post, inputSha256)
    expect(await readClassifierRunDispatcherJobsForTest(post.id)).toEqual([])

    await sweep(requests)
    await processClassifierRunDispatcher(classifierRunDispatcherJobFor(post.id))
    await processClassifierRunDispatcher(classifierRunDispatcherJobFor(post.id))
    await sweep(requests)

    const runs = await getClassifierRunFacts(post.id, POST_CLASSIFIER_SLUG)
    expect(runs).toHaveLength(1)
    expect(await readClassifierRunJobsForTest(runs[0]!.id)).toHaveLength(1)
  })

  it('never discovers an approved post that has no request, so pre-cutover posts are not backfilled', async () => {
    const { post } = await createApprovedClassifierPost(true, true)
    scope.postIds.add(post.id)

    await expect(sweep(requests)).resolves.toEqual(noRequests)

    expect(await readClassifierRunDispatcherJobsForTest(post.id)).toEqual([])
    expect(await getClassifierRunFacts(post.id)).toEqual([])
  })

  it('stops discovering a subject once its run is reserved', async () => {
    const { post, inputSha256 } = await createApprovedClassifierPost(true, true)
    scope.postIds.add(post.id)
    await requestPostClassifierRun(post, inputSha256)
    await sweep(requests)
    const [dispatcher] = await readClassifierRunDispatcherJobsForTest(post.id)

    await getClassifierRunHandler(POST_CLASSIFIER_SLUG).reserve({
      postId: post.id,
      rssFeedItemId: null,
    })

    expect(dispatcher?.data).toEqual({
      classifier: POST_CLASSIFIER_SLUG,
      postId: post.id,
      rssFeedItemId: null,
    })
    await expect(sweep(requests)).resolves.toEqual(noRequests)
  })

  it('starts one request sweep per classifier from the tick and chains a full page', async () => {
    const chained = randomUUID()
    const handler = {
      ...scope.handler,
      pendingRequests: async () => ({
        items: [
          {
            requestId: randomUUID(),
            postId: randomUUID(),
            rssFeedItemId: null,
            createdAt: new Date(),
          },
        ],
        next: chained,
      }),
    }

    const fake = { handlerFor: () => handler }

    await expect(sweep(requests, fake)).resolves.toEqual({
      ...noRequests,
      dispatched: 1,
      hasNext: true,
    })
    await sweep(requests, fake)
    await sweep()

    const jobIds = (await readAllQueueJobs(ai_agents)).map(job => job.id)
    const next = `reconcile_classifier_runs_requests_${POST_CLASSIFIER_SLUG}_${chained}`
    expect(jobIds.filter(id => id === next)).toHaveLength(1)
    expect(jobIds).toContain(`reconcile_classifier_runs_requests_${POST_CLASSIFIER_SLUG}_start`)
  })

  it('needs a classifier to sweep requests', async () => {
    await expect(sweep({ phase: 'requests' })).rejects.toThrow(
      'A request sweep page needs its classifier',
    )
  })
})

describe('classifier run recovery sweep: incomplete runs', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  beforeEach(() => scope.reset())
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => release?.())

  it('re-queues a run whose job is gone once, and leaves a run whose job is still queued', async () => {
    const run = await dispatchTracked(true)

    await sweep()
    expect((await runFacts(run.post.id)).sweep_enqueue_count).toBe(0)

    removeClassifierRunJobForTest(run.runId)
    await sweep()
    await sweep()

    expect(await readClassifierRunJobsForTest(run.runId)).toHaveLength(1)
    expect((await runFacts(run.post.id)).sweep_enqueue_count).toBe(1)
  })

  it('drains a backlog across chained pages and adds each page once', async () => {
    const first = await dispatchTracked(false)
    const second = await dispatchTracked(false)
    removeClassifierRunJobForTest(first.runId)
    removeClassifierRunJobForTest(second.runId)

    const paged = await sweep({ phase: 'incomplete' }, {}, 1)
    await sweep({ phase: 'incomplete' }, {}, 1)

    expect(paged).toMatchObject({ kind: 'incomplete', enqueued: 1, hasNext: true })
    const [firstId, secondId] = [first.runId, second.runId].sort()
    const chained = (await readAllQueueJobs(ai_agents)).filter(
      job => job.id === `reconcile_classifier_runs_incomplete_all_${firstId}`,
    )
    expect(chained).toHaveLength(1)
    await expect(sweep({ phase: 'incomplete', after: firstId }, {}, 1)).resolves.toMatchObject({
      enqueued: 1,
      hasNext: false,
    })
    expect(await readClassifierRunJobsForTest(secondId!)).toHaveLength(1)
  })

  it('re-queues a run with attempts left after its lease expired', async () => {
    const run = await dispatchTracked(true)
    const adapter = createPostClassifierRunAdapter(detectorPackage.version)
    const claim = await claimClassifierRun(adapter, {
      runId: run.runId,
      subject: { postId: run.post.id, rssFeedItemId: null },
      inputSha256: run.inputSha256,
      configurationSha256: Buffer.from(run.data.configurationSha256, 'hex'),
      leaseSeconds: 60,
    })
    if (claim.kind !== 'claimed') throw new Error(`Unexpected claim: ${claim.kind}`)
    await startClassifierProviderAttempt(adapter, { lease: claim.lease, maxAttempts: 3 })
    await expireClassifierRunLeaseForTest(run.runId)
    removeClassifierRunJobForTest(run.runId)

    await sweep()

    expect(await readClassifierRunJobsForTest(run.runId)).toHaveLength(1)
    expect(await runFacts(run.post.id)).toMatchObject({
      provider_attempts_started: 1,
      sweep_enqueue_count: 1,
      terminal_failure_kind: null,
    })
  })

  it.each(['provider-error', 'invalid-result', 'context-rejected', 'attempts-exhausted'])(
    'never re-queues a run that ended permanently as %s',
    async kind => {
      const run = await dispatchTracked(true)
      await markClassifierRunTerminalForTest(run.runId, kind)
      removeClassifierRunJobForTest(run.runId)

      await sweep()
      await sweep()

      expect(await readClassifierRunJobsForTest(run.runId)).toHaveLength(0)
      expect((await runFacts(run.post.id)).sweep_enqueue_count).toBe(0)
    },
  )

  it('ends a run without a provider client for good, keeps its local outcome and alarms once', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '')
    const run = await dispatchTracked(true)

    await expect(processClassifierRun(classifierRunJobFor(run.data))).resolves.toEqual({
      kind: 'terminal',
    })
    removeClassifierRunJobForTest(run.runId)
    await sweep()
    await sweep()

    expect(await readClassifierRunJobsForTest(run.runId)).toHaveLength(0)
    expect(await runFacts(run.post.id)).toMatchObject({
      terminal_failure_kind: 'client-unavailable',
      provider_attempts_started: 0,
      sweep_enqueue_count: 0,
      lease_token: null,
      completed_at: null,
    })
    expect(await getPostClassifierLocalOutcomeFacts(run.runId)).toMatchObject({
      flagged: expect.any(Boolean),
      detector: expect.any(String),
    })
    const alarms = sentryCaptureMessageMock.mock.calls.filter(
      ([message, hint]) => message === 'classifier_run_alarm' && hint.extra.runId === run.runId,
    )
    expect(alarms).toHaveLength(1)
    expect(alarms[0]?.[1].tags).toMatchObject({
      alarm_kind: 'client-unavailable',
      classifier: POST_CLASSIFIER_SLUG,
    })
  })

  it('stops before enqueuing anything while the provider spend cap is breached', async () => {
    const run = await dispatchTracked(true)
    const { post, inputSha256 } = await createApprovedClassifierPost(true, true)
    scope.postIds.add(post.id)
    await requestPostClassifierRun(post, inputSha256)
    removeClassifierRunJobForTest(run.runId)
    const breached = {
      evaluateSpendCap: async () => ({
        reason: 'cap_exceeded' as const,
        dailyCapMicrounits: 1,
        day: '2026-09-30',
        totalMicrounits: 2,
      }),
    }

    await expect(sweep({}, breached)).resolves.toEqual({ kind: 'spend-cap-breach' })
    await expect(sweep(requests, breached)).resolves.toEqual({ kind: 'spend-cap-breach' })

    expect(await readClassifierRunJobsForTest(run.runId)).toHaveLength(0)
    expect(await readClassifierRunDispatcherJobsForTest(post.id)).toHaveLength(0)
    expect((await runFacts(run.post.id)).sweep_enqueue_count).toBe(0)
  })
})
