import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { createTestPost, createTestUser, insertTestCommunity } from '@voucha/test-helpers'
import { initializePostClassifierExecutionTests } from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import {
  getPostClassifierApplicationFacts,
  setPostClassifierPostHashForTest,
  setPostClassifierSweepEnqueueCountForTest,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/application-service'
import { setPostClassifierToggleForTest } from '@voucha/test-helpers/entities/post-classifier-toggles'
import {
  readPostClassifierJobsForTest,
  removePostClassifierJobForTest,
} from '@voucha/test-helpers/post-classifier-queue-jobs'
import { POST_CLASSIFIER_SWEEP_ENQUEUE_BOUND as BOUND } from '@services/post-classifier'
import { createPostModerationContent } from '@services/posts/content'
import type {
  PostClassifierDispatcherJobData,
  PostClassifierJobData,
} from '@queues/ai-agents/types'
import { sentryCaptureMessageMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { processAIAgent } from '../processors.mts'
import { processPostClassifierDispatcher } from './process-post-classifier.mts'
import {
  POST_CLASSIFIER_RECEIPT_AGE_ALARM_MS,
  processReconcilePostClassifierApplications,
} from './process-reconcile-post-classifier-applications.mts'

/** Dispatches a receipt for a new approved post, like the post-approval flow does. */
async function dispatchReceipt(remote: boolean) {
  const user = await createTestUser()
  const community = await insertTestCommunity({ createdById: user.id })
  if (remote) await setPostClassifierToggleForTest(community.id, 'self-promotion', true)
  const post = await createTestPost({ user, community_id: community.id })
  await setPostClassifierPostHashForTest(post.id, createPostModerationContent(post).content_sha256)
  await processPostClassifierDispatcher({
    id: randomUUID(),
    name: 'post-classifier-dispatcher',
    data: { postId: post.id },
  } as Job<PostClassifierDispatcherJobData>)
  const facts = (await getPostClassifierApplicationFacts(post.id))[0]
  if (!facts) throw new Error('Expected a post classifier receipt')
  return { postId: post.id, applicationId: facts.id }
}

async function factsOf(receipt: { postId: string }) {
  return (await getPostClassifierApplicationFacts(receipt.postId))[0]
}

function alarmsOf(kind: string, applicationId?: string) {
  return sentryCaptureMessageMock.mock.calls.filter(
    ([message, hint]) =>
      message === 'post_classifier_receipt_alarm' &&
      hint.tags.alarm_kind === kind &&
      (applicationId === undefined || hint.extra.applicationId === applicationId),
  )
}

describe('post classifier recovery sweep', () => {
  let releaseSeedLock: (() => Promise<void>) | undefined
  beforeAll(async () => {
    releaseSeedLock = await initializePostClassifierExecutionTests()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })
  afterAll(async () => releaseSeedLock?.())

  it('does not re-enqueue a receipt made terminal by a missing provider key', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '')
    const receipt = await dispatchReceipt(true)
    const [job] = await readPostClassifierJobsForTest(receipt.applicationId)

    await expect(
      processAIAgent({
        id: job!.id,
        name: job!.name,
        data: job!.data,
      } as Job<PostClassifierJobData>),
    ).resolves.toEqual({ kind: 'terminal' })

    expect(await factsOf(receipt)).toMatchObject({
      terminal_remote_failure_kind: 'client-unavailable',
      provider_attempts_started: 0,
      lease_token: null,
      outcomes_persisted_at: null,
      completed_at: null,
      local_flagged: expect.any(Boolean),
      local_detector: expect.any(String),
    })
    expect(alarmsOf('client-unavailable', receipt.applicationId)).toHaveLength(1)

    removePostClassifierJobForTest(receipt.applicationId)
    await processReconcilePostClassifierApplications()
    await processReconcilePostClassifierApplications()

    expect(await readPostClassifierJobsForTest(receipt.applicationId)).toHaveLength(0)
    expect(await factsOf(receipt)).toMatchObject({
      sweep_enqueue_count: 0,
      terminal_remote_failure_kind: 'client-unavailable',
    })
  })

  it('counts only enqueues that add a job and ends the receipt once the bound is spent', async () => {
    const receipt = await dispatchReceipt(true)

    await processReconcilePostClassifierApplications()
    expect((await factsOf(receipt))?.sweep_enqueue_count).toBe(0)

    for (let enqueue = 1; enqueue <= BOUND; enqueue++) {
      removePostClassifierJobForTest(receipt.applicationId)
      await processReconcilePostClassifierApplications()
      await processReconcilePostClassifierApplications()
      expect((await factsOf(receipt))?.sweep_enqueue_count).toBe(enqueue)
      expect(await readPostClassifierJobsForTest(receipt.applicationId)).toHaveLength(1)
    }

    // Its last permitted job is still queued (for example parked by the spend cap): no give-up.
    expect(await factsOf(receipt)).toMatchObject({
      sweep_enqueue_count: BOUND,
      terminal_remote_failure_kind: null,
    })
    expect(alarmsOf('sweep-bound-exceeded', receipt.applicationId)).toHaveLength(0)

    removePostClassifierJobForTest(receipt.applicationId)
    const { abandoned } = await processReconcilePostClassifierApplications()

    expect(abandoned).toBeGreaterThanOrEqual(1)
    expect(await factsOf(receipt)).toMatchObject({
      sweep_enqueue_count: BOUND + 1,
      terminal_remote_failure_kind: 'sweep-bound-exceeded',
      terminal_remote_failed_at: expect.any(Date),
      lease_token: null,
      completed_at: null,
    })
    const [alarm] = alarmsOf('sweep-bound-exceeded', receipt.applicationId)
    expect(alarm?.[1].extra).toMatchObject({ sweepEnqueueCount: BOUND, terminal: true })

    await processReconcilePostClassifierApplications()
    expect(await readPostClassifierJobsForTest(receipt.applicationId)).toHaveLength(0)
    expect((await factsOf(receipt))?.sweep_enqueue_count).toBe(BOUND + 1)
    expect(alarmsOf('sweep-bound-exceeded', receipt.applicationId)).toHaveLength(1)
  })

  it('abandons a local-only receipt at the bound without a terminal remote kind', async () => {
    const receipt = await dispatchReceipt(false)
    await setPostClassifierSweepEnqueueCountForTest(receipt.postId, receipt.applicationId, BOUND)
    removePostClassifierJobForTest(receipt.applicationId)

    await processReconcilePostClassifierApplications()

    expect(await factsOf(receipt)).toMatchObject({
      sweep_enqueue_count: BOUND + 1,
      terminal_remote_failure_kind: null,
      completed_at: null,
    })
    const [alarm] = alarmsOf('sweep-bound-exceeded', receipt.applicationId)
    expect(alarm?.[1].extra).toMatchObject({ terminal: false })
    await processReconcilePostClassifierApplications()
    expect(await readPostClassifierJobsForTest(receipt.applicationId)).toHaveLength(0)
  })

  it('alarms once the oldest in-flight receipt outlives the longest legitimate delay', async () => {
    await dispatchReceipt(true)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + POST_CLASSIFIER_RECEIPT_AGE_ALARM_MS + 60 * 60 * 1000)

    await processReconcilePostClassifierApplications()

    const [alarm] = alarmsOf('receipt-age')
    expect(alarm?.[1].extra).toMatchObject({
      thresholdMs: POST_CLASSIFIER_RECEIPT_AGE_ALARM_MS,
      oldestReceiptAgeMs: expect.any(Number),
    })
    expect(alarm?.[1].extra.oldestReceiptAgeMs).toBeGreaterThan(
      POST_CLASSIFIER_RECEIPT_AGE_ALARM_MS,
    )
  })

  it('does not raise the age alarm for a receipt inside that window', async () => {
    const receipt = await dispatchReceipt(true)

    await processReconcilePostClassifierApplications()

    expect(alarmsOf('receipt-age', receipt.applicationId)).toHaveLength(0)
  })
})
