import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { removeClassifierRunJobForTest } from '@voucha/test-helpers/classifier-run-queue-jobs'
import { AI_AGENTS_DEFAULTS, CLASSIFIER_RUN_ATTEMPTS, CLASSIFIER_RUN_BACKOFF } from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { ClassifierRunJobData } from '../types.mts'
import {
  classifierRunDispatcherJobId,
  classifierRunJobExists,
  enqueueBulkClassifierRunDispatchers,
  enqueueBulkClassifierRuns,
  enqueueClassifierRun,
  enqueueClassifierRunDispatcher,
} from './classifier-run.mts'
import {
  enqueueReconcileClassifierRuns,
  enqueueReconcileClassifierRunsPage,
} from './reconcile-classifier-runs.mts'

function runJobData(classifier = 'post-classifier'): ClassifierRunJobData {
  return {
    classifier,
    runId: randomUUID(),
    postId: randomUUID(),
    rssFeedItemId: null,
    inputSha256: Buffer.alloc(32, 1).toString('hex'),
    configurationSha256: Buffer.alloc(32, 2).toString('hex'),
  }
}

describe('classifier run enqueue', () => {
  it('enqueues a dispatcher and the sweep tick with their worker job names', async () => {
    const postId = randomUUID()
    await enqueueClassifierRunDispatcher({
      classifier: 'post-classifier',
      postId,
      rssFeedItemId: null,
    })
    const sweep = await enqueueReconcileClassifierRuns()
    if (!sweep) throw new Error('Expected a sweep job')

    const jobs = await readAllQueueJobs(ai_agents)

    expect(jobs).toContainEqual(
      expect.objectContaining({
        name: 'classifier-run-dispatcher',
        data: { classifier: 'post-classifier', postId, rssFeedItemId: null },
      }),
    )
    expect(jobs).toContainEqual(
      expect.objectContaining({ id: sweep.id, name: 'reconcile-classifier-runs', data: {} }),
    )
  })

  it('identifies a dispatcher by classifier and subject so approval and the sweep share it', async () => {
    const postId = randomUUID()
    const rssFeedItemId = randomUUID()

    expect(classifierRunDispatcherJobId({ classifier: 'a', postId, rssFeedItemId: null })).toBe(
      `classifier_run_dispatcher_a_${postId}`,
    )
    expect(classifierRunDispatcherJobId({ classifier: 'a', postId: null, rssFeedItemId })).toBe(
      `classifier_run_dispatcher_a_${rssFeedItemId}`,
    )
    expect(classifierRunDispatcherJobId({ classifier: 'b', postId, rssFeedItemId: null })).not.toBe(
      classifierRunDispatcherJobId({ classifier: 'a', postId, rssFeedItemId: null }),
    )
  })

  it('adds a dispatcher once however many times approval and the sweep enqueue it', async () => {
    const data = { classifier: 'post-classifier', postId: randomUUID(), rssFeedItemId: null }

    await enqueueClassifierRunDispatcher(data)
    await enqueueClassifierRunDispatcher(data)
    await enqueueBulkClassifierRunDispatchers([data])
    await enqueueBulkClassifierRunDispatchers([])

    const jobs = (await readAllQueueJobs(ai_agents)).filter(
      job =>
        job.name === 'classifier-run-dispatcher' &&
        (job.data as { postId: string }).postId === data.postId,
    )
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.opts).toMatchObject({
      removeOnComplete: true,
      removeOnFail: true,
      jobId: classifierRunDispatcherJobId(data),
      // The dispatcher never calls a provider, so it keeps the shared queue defaults.
      attempts: AI_AGENTS_DEFAULTS.attempts,
      backoff: AI_AGENTS_DEFAULTS.backoff,
    })
  })

  it('keeps a durable run job retryable after queue attempt exhaustion', async () => {
    const data = runJobData()

    await enqueueClassifierRun(data)

    const job = (await readAllQueueJobs(ai_agents)).find(
      candidate =>
        candidate.name === 'classifier-run' &&
        (candidate.data as ClassifierRunJobData).runId === data.runId,
    )
    // The receipt's attempt cap is this same constant, so a retry never outruns the receipt.
    expect(job?.opts).toMatchObject({
      attempts: CLASSIFIER_RUN_ATTEMPTS,
      backoff: CLASSIFIER_RUN_BACKOFF,
      removeOnComplete: true,
      removeOnFail: true,
      jobId: `classifier_run_${data.runId}`,
    })
  })

  it('adds a recovery page as independent runs and reports only the jobs it added', async () => {
    const first = runJobData()
    const second = runJobData()

    await expect(enqueueBulkClassifierRuns([first])).resolves.toEqual([first.runId])
    await expect(enqueueBulkClassifierRuns([first, second])).resolves.toEqual([second.runId])
    await expect(enqueueBulkClassifierRuns([first, second])).resolves.toEqual([])
    await expect(enqueueBulkClassifierRuns([])).resolves.toEqual([])
  })

  it('reports whether the run job is still retained', async () => {
    const data = runJobData()
    await expect(classifierRunJobExists(data.runId)).resolves.toBe(false)

    await enqueueClassifierRun(data)
    await expect(classifierRunJobExists(data.runId)).resolves.toBe(true)

    removeClassifierRunJobForTest(data.runId)
    await expect(classifierRunJobExists(data.runId)).resolves.toBe(false)
  })

  it('identifies a sweep page by phase, classifier and cursor so overlapping sweeps add it once', async () => {
    const page = {
      phase: 'requests',
      classifier: `c-${randomUUID()}`,
      after: randomUUID(),
    } as const

    const first = await enqueueReconcileClassifierRunsPage(page)
    const second = await enqueueReconcileClassifierRunsPage(page)

    expect(second ?? null).toBeNull()
    expect(first?.id).toBe(`reconcile_classifier_runs_requests_${page.classifier}_${page.after}`)
    expect((await readAllQueueJobs(ai_agents)).filter(job => job.id === first?.id)).toHaveLength(1)
  })
})
