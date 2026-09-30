import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  getPostClassifierApplicationFacts,
  setPostClassifierSweepEnqueueCountForTest,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/application-service'
import {
  createPostClassifierExecutionFixture,
  initializePostClassifierExecutionTests,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import {
  failPostClassifierClientUnavailable,
  startPostClassifierProviderAttempt,
} from './application-attempt.mts'
import { persistPostClassifierOutcomes } from './application-outcomes.mts'
import {
  POST_CLASSIFIER_SWEEP_ENQUEUE_BOUND as BOUND,
  abandonPostClassifierSweepReceipt,
  recordPostClassifierSweepEnqueues,
} from './application-sweep.mts'

type Fixture = Awaited<ReturnType<typeof createPostClassifierExecutionFixture>>

function receiptOf(input: Fixture) {
  return { postId: input.post.id, applicationId: input.lease.applicationId }
}

async function factsOf(input: Fixture) {
  const facts = (await getPostClassifierApplicationFacts(input.post.id))[0]
  if (!facts) throw new Error('Missing post classifier receipt')
  return facts
}

/** A remote receipt whose outcomes are already durable, so only its effects remain pending. */
async function createEffectOnlyFixture(): Promise<Fixture> {
  const input = await createPostClassifierExecutionFixture(true, false)
  const remote = input.lease.resolved.configuration.remote
  const question = remote?.questions[0]
  if (!remote || !question) throw new Error('Missing remote test configuration')
  await startPostClassifierProviderAttempt({ ...input.lease, maxAttempts: input.maxAttempts })
  await persistPostClassifierOutcomes({
    lease: input.lease,
    remoteDecision: {
      batchId: input.lease.decisionBatchId!,
      classifierId: remote.classifierId,
      promptVersionId: remote.promptVersionId,
      scope: { scopeCategory: 'global', scopeCommunityId: null },
      subject: { postId: input.post.id, rssFeedItemId: null },
      calls: [
        {
          shardOrdinal: 0,
          results: [
            {
              candidateKind: 'topic',
              topicId: question.topicId,
              storedCandidateId: question.candidateId,
              probability: 0.9,
              rawResponse: { type: 'noul', probability: 0.9 },
            },
          ],
        },
      ],
    },
  })
  return input
}

describe('post classifier sweep bound (real PG)', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  afterAll(async () => release?.())

  it('counts one added job per listed receipt and stops counting past the bound', async () => {
    const counted = await createPostClassifierExecutionFixture()
    const untouched = await createPostClassifierExecutionFixture()

    await recordPostClassifierSweepEnqueues([])
    await recordPostClassifierSweepEnqueues([receiptOf(counted)])
    await recordPostClassifierSweepEnqueues([receiptOf(counted)])

    expect((await factsOf(counted)).sweep_enqueue_count).toBe(2)
    expect((await factsOf(untouched)).sweep_enqueue_count).toBe(0)

    await setPostClassifierSweepEnqueueCountForTest(
      counted.post.id,
      counted.lease.applicationId,
      BOUND,
    )
    await recordPostClassifierSweepEnqueues([receiptOf(counted)])
    expect((await factsOf(counted)).sweep_enqueue_count).toBe(BOUND + 1)
    await recordPostClassifierSweepEnqueues([receiptOf(counted)])
    expect((await factsOf(counted)).sweep_enqueue_count).toBe(BOUND + 1)
  })

  it('ends a remote receipt at the bound with a terminal kind and no lease', async () => {
    const input = await createPostClassifierExecutionFixture()
    await setPostClassifierSweepEnqueueCountForTest(input.post.id, input.lease.applicationId, BOUND)

    await expect(abandonPostClassifierSweepReceipt(receiptOf(input))).resolves.toBe('terminal')

    expect(await factsOf(input)).toMatchObject({
      sweep_enqueue_count: BOUND + 1,
      terminal_remote_failure_kind: 'sweep-bound-exceeded',
      terminal_remote_failed_at: expect.any(Date),
      lease_token: null,
      outcomes_persisted_at: null,
      completed_at: null,
    })
    await expect(abandonPostClassifierSweepReceipt(receiptOf(input))).resolves.toBe('skipped')
  })

  it('abandons a local-only receipt because its constraint forbids a terminal remote kind', async () => {
    const input = await createPostClassifierExecutionFixture(false)
    expect((await factsOf(input)).decision_batch_id).toBeNull()
    await setPostClassifierSweepEnqueueCountForTest(input.post.id, input.lease.applicationId, BOUND)

    await expect(abandonPostClassifierSweepReceipt(receiptOf(input))).resolves.toBe('abandoned')

    expect(await factsOf(input)).toMatchObject({
      sweep_enqueue_count: BOUND + 1,
      terminal_remote_failure_kind: null,
      terminal_remote_failed_at: null,
      lease_token: input.lease.leaseToken,
      completed_at: null,
    })
  })

  it('abandons a remote receipt whose outcomes are already durable', async () => {
    const input = await createEffectOnlyFixture()
    await setPostClassifierSweepEnqueueCountForTest(input.post.id, input.lease.applicationId, BOUND)

    await expect(abandonPostClassifierSweepReceipt(receiptOf(input))).resolves.toBe('abandoned')

    expect(await factsOf(input)).toMatchObject({
      sweep_enqueue_count: BOUND + 1,
      terminal_remote_failure_kind: null,
      outcomes_persisted_at: expect.any(Date),
      completed_at: null,
    })
  })

  it('skips receipts that are below the bound or already ended', async () => {
    const early = await createPostClassifierExecutionFixture()
    await setPostClassifierSweepEnqueueCountForTest(
      early.post.id,
      early.lease.applicationId,
      BOUND - 1,
    )
    await expect(abandonPostClassifierSweepReceipt(receiptOf(early))).resolves.toBe('skipped')
    expect(await factsOf(early)).toMatchObject({
      sweep_enqueue_count: BOUND - 1,
      terminal_remote_failure_kind: null,
    })

    const ended = await createPostClassifierExecutionFixture(true, false)
    await expect(failPostClassifierClientUnavailable(ended.lease)).resolves.toBe('terminal')
    await setPostClassifierSweepEnqueueCountForTest(ended.post.id, ended.lease.applicationId, BOUND)
    await expect(abandonPostClassifierSweepReceipt(receiptOf(ended))).resolves.toBe('skipped')
    expect(await factsOf(ended)).toMatchObject({
      sweep_enqueue_count: BOUND,
      terminal_remote_failure_kind: 'client-unavailable',
    })
  })
})

describe('post classifier client-unavailable receipt (real PG)', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  afterAll(async () => release?.())

  it('leaves a receipt with durable outcomes alone', async () => {
    const input = await createEffectOnlyFixture()
    const before = await factsOf(input)

    await expect(failPostClassifierClientUnavailable(input.lease)).resolves.toBe('stale')

    expect(await factsOf(input)).toEqual(before)
  })

  it('refuses a local-only receipt that has no remote client to lose', async () => {
    const input = await createPostClassifierExecutionFixture(false)

    await expect(failPostClassifierClientUnavailable(input.lease)).rejects.toThrow(
      'no remote client to lose',
    )

    expect(await factsOf(input)).toMatchObject({
      terminal_remote_failure_kind: null,
      lease_token: input.lease.leaseToken,
    })
  })
})
