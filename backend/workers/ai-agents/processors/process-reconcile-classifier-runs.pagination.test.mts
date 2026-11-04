import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import {
  createClassifierRunSweepScope,
  createTestClassifierSweepNeighbor,
  dispatchApprovedClassifierPost,
  requestPostClassifierRun,
  POST_CLASSIFIER_SLUG,
} from '@voucha/test-helpers/classifier-run-worker'
import {
  readClassifierRunJobsForTest,
  removeClassifierRunJobForTest,
} from '@voucha/test-helpers/classifier-run-queue-jobs'
import { getClassifierRunRequestFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import {
  createApprovedClassifierPost,
  initializePostClassifierExecutionTests,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import { ai_agents } from '@queues/ai-agents/queues'
import { getClassifierRunHandler } from './classifier-run-registry.mts'
import { processReconcileClassifierRuns } from './process-reconcile-classifier-runs.mts'

const scope = createClassifierRunSweepScope(getClassifierRunHandler(POST_CLASSIFIER_SLUG))
const sweep = (data = {}, pageSize = 2) =>
  processReconcileClassifierRuns(data, scope.ids(), pageSize)
const requests = { phase: 'requests', classifier: POST_CLASSIFIER_SLUG } as const
const noRequests = { kind: 'requests', dispatched: 0, hasNext: false }

async function dispatchTracked(remote: boolean) {
  const dispatched = await dispatchApprovedClassifierPost(remote)
  scope.track(dispatched.post, dispatched.runId)
  return dispatched
}

describe('classifier recovery pagination', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  beforeEach(() => scope.reset())
  afterAll(async () => release?.())

  it('starts one request sweep per classifier from the tick and chains a full page', async () => {
    const first = await createApprovedClassifierPost(true, true)
    const second = await createApprovedClassifierPost(true, true)
    scope.postIds.add(first.post.id)
    scope.postIds.add(second.post.id)
    await requestPostClassifierRun(first.post, first.inputSha256)
    await requestPostClassifierRun(second.post, second.inputSha256)
    const requestIds = [
      (await getClassifierRunRequestFacts(first.post.id, POST_CLASSIFIER_SLUG))[0]!.id,
      (await getClassifierRunRequestFacts(second.post.id, POST_CLASSIFIER_SLUG))[0]!.id,
    ].toSorted()
    const outside = await createTestClassifierSweepNeighbor(
      getClassifierRunHandler(POST_CLASSIFIER_SLUG),
    )
    const [outsideRequest] = await getClassifierRunRequestFacts(
      outside.pendingSubject.postId,
      POST_CLASSIFIER_SLUG,
    )
    expect(outsideRequest!.id.localeCompare(requestIds[1]!)).toBeGreaterThan(0)
    const chained = requestIds[0]!

    await expect(sweep(requests, 1)).resolves.toEqual({
      ...noRequests,
      dispatched: 1,
      hasNext: true,
    })
    await sweep(requests, 1)
    await expect(sweep({ ...requests, after: chained }, 1)).resolves.toEqual({
      ...noRequests,
      dispatched: 1,
      hasNext: true,
    })
    await sweep({ ...requests, after: chained }, 1)
    await expect(sweep({ ...requests, after: requestIds[1] }, 1)).resolves.toEqual(noRequests)
    await sweep()

    const jobIds = (await readAllQueueJobs(ai_agents)).map(job => job.id)
    const next = `reconcile_classifier_runs_requests_${POST_CLASSIFIER_SLUG}_${chained}`
    expect(jobIds.filter(id => id === next)).toHaveLength(1)
    expect(
      jobIds.filter(
        id => id === `reconcile_classifier_runs_requests_${POST_CLASSIFIER_SLUG}_${requestIds[1]}`,
      ),
    ).toHaveLength(1)
    expect(jobIds).toContain(`reconcile_classifier_runs_requests_${POST_CLASSIFIER_SLUG}_start`)
    await outside.assertUnchanged()
  })

  it('drains a backlog across chained pages and adds each page once', async () => {
    const first = await dispatchTracked(false)
    const second = await dispatchTracked(false)
    removeClassifierRunJobForTest(first.runId)
    removeClassifierRunJobForTest(second.runId)
    const outside = await createTestClassifierSweepNeighbor(
      getClassifierRunHandler(POST_CLASSIFIER_SLUG),
    )
    expect(outside.runId.localeCompare(first.runId)).toBeGreaterThan(0)
    expect(outside.runId.localeCompare(second.runId)).toBeGreaterThan(0)

    const paged = await sweep({ phase: 'incomplete' }, 1)
    await sweep({ phase: 'incomplete' }, 1)

    expect(paged).toMatchObject({ kind: 'incomplete', enqueued: 1, hasNext: true })
    const [firstId, secondId] = [first.runId, second.runId].toSorted()
    const chained = (await readAllQueueJobs(ai_agents)).filter(
      job => job.id === `reconcile_classifier_runs_incomplete_all_${firstId}`,
    )
    expect(chained).toHaveLength(1)
    await expect(sweep({ phase: 'incomplete', after: firstId }, 1)).resolves.toMatchObject({
      enqueued: 1,
      hasNext: true,
    })
    await sweep({ phase: 'incomplete', after: firstId }, 1)
    const secondPageJobs = (await readAllQueueJobs(ai_agents)).filter(
      job => job.id === `reconcile_classifier_runs_incomplete_all_${secondId}`,
    )
    expect(secondPageJobs).toHaveLength(1)
    await expect(sweep({ phase: 'incomplete', after: secondId }, 1)).resolves.toMatchObject({
      enqueued: 0,
      hasNext: false,
    })
    expect(await readClassifierRunJobsForTest(secondId!)).toHaveLength(1)
    await outside.assertUnchanged()
  })
})
