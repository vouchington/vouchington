import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createTestPost, createTestTopic, createTestUser } from '@voucha/test-helpers'
import { listAutotaggerReceiptAttempts } from '@voucha/test-helpers/data-stores/psql/autotagger-receipts'
import { createFakeStructuredDecisionClient } from '@voucha/test-helpers/agents/autotagger/fake-structured-decision-client'
import { sanitizeClassifierExternalContent } from '@agents/classifiers/safe-content'
import { getActiveClassifierConfigurationBySlugFromPrimary } from '@services/classifiers'
import {
  claimAutotaggerReceipt,
  AUTOTAGGER_RECEIPT_DIGEST_VERSION,
  type AutotaggerReceiptSubject,
} from '@services/autotagger'
import {
  StructuredDecisionError,
  type createStructuredDecisionClient,
  type StructuredDecisionClient,
} from '@modules/structured-decisions'
import {
  dispatchAutotaggerClassifier,
  resolveStructuredDecisionApiKey,
  type AutotaggerClassifierCandidate,
  type AutotaggerClassifierDispatchInput,
} from './dispatch-classifier.mts'
import { buildAutotaggerClassifierBindingsAndDigest } from './dispatch-classifier-bindings.mts'

// Continues dispatch-classifier.test.mts, split to stay under the repository's per-test-file line
// cap; see that file for the pre-write `tagging`-classifier conflict audit.
const TAGGING_SLUG = 'tagging'

// NOT COVERED HERE, BY DESIGN: `executeAndPersistAutotaggerDecision`'s `signal.aborted` ->
// 'provider-error' branch (dispatch-classifier-execute.mts, DISPATCH_TIMEOUT_MS = 55s) has no
// automated-test seam. The AbortSignal comes from `AbortSignal.timeout(...)` constructed inside that
// function; `AutotaggerClassifierDispatchDeps` deliberately exposes only `createClient` as an
// overridable seam (per the repository's test-mocking rule), and widening it just to fire a
// 55-second timer sooner would itself be the kind of test-only injection point that rule avoids.
// This branch is verified by code trace only: `signal.aborted` is checked in the same `||` branch as
// `error instanceof StructuredDecisionError`, both mapping to the identical 'provider-error' outcome
// exercised by the provider-error test below.

async function buildDispatchFixture(topicCount = 1): Promise<{
  subject: AutotaggerReceiptSubject
  state: AutotaggerClassifierDispatchInput['state']
  candidates: AutotaggerClassifierCandidate[]
  topics: { id: string; name: string }[]
}> {
  const user = await createTestUser()
  const post = await createTestPost({ user })
  const topics = await Promise.all(
    Array.from({ length: topicCount }, () => createTestTopic({ user })),
  )
  const state = await sanitizeClassifierExternalContent(
    `Dispatch classifier test content ${randomUUID()}`,
    { source: 'post', contentType: 'user_post' },
  )
  return {
    subject: { postId: post.id, rssFeedItemId: null },
    state,
    candidates: topics.map(topic => ({ topicId: topic.id, name: topic.name })),
    topics,
  }
}

describe('dispatchAutotaggerClassifier failure classification', () => {
  it('records provider-error, releases the lease, and lets a retry recover and dispatch', async () => {
    const { subject, state, candidates, topics } = await buildDispatchFixture(1)
    const topic = topics[0]!
    const input: AutotaggerClassifierDispatchInput = {
      subject,
      state,
      candidates,
      maxCandidates: candidates.length,
    }

    const throwingDecide = vi.fn<StructuredDecisionClient['decide']>(async () => {
      throw new StructuredDecisionError('provider-error', 'simulated provider outage')
    })
    const throwingCreateClient = vi.fn<typeof createStructuredDecisionClient>(() => ({
      decide: throwingDecide,
    }))

    await expect(
      dispatchAutotaggerClassifier(input, { createClient: throwingCreateClient }),
    ).rejects.toThrow(StructuredDecisionError)
    expect(throwingDecide).toHaveBeenCalledTimes(1)

    const recovered = createFakeStructuredDecisionClient({ [topic.id]: 0.95 })
    const result = await dispatchAutotaggerClassifier(input, {
      createClient: recovered.createClient,
    })
    expect(recovered.decide).toHaveBeenCalledTimes(1)
    expect(result?.topicIds).toEqual([topic.id])

    const configuration = await getActiveClassifierConfigurationBySlugFromPrimary(TAGGING_SLUG)
    if (!configuration) throw new Error('tagging classifier configuration not seeded')
    const { digest } = await buildAutotaggerClassifierBindingsAndDigest(configuration, input)
    const claim = await claimAutotaggerReceipt({
      subject,
      digestVersion: AUTOTAGGER_RECEIPT_DIGEST_VERSION,
      digest,
      leaseSeconds: 60,
    })
    if (claim.kind !== 'completed')
      throw new Error('expected the recovered receipt to be completed')
    const attempts = await listAutotaggerReceiptAttempts(claim.receiptId)
    expect(attempts.map(attempt => attempt.outcome)).toEqual(['provider-error', null])
    expect(attempts[1]?.completed_at).not.toBeNull()
  })

  it('records invalid-result when the provider answer set does not cover every candidate', async () => {
    const { subject, state, candidates } = await buildDispatchFixture(1)
    const input: AutotaggerClassifierDispatchInput = {
      subject,
      state,
      candidates,
      maxCandidates: candidates.length,
    }
    const incompleteDecide = vi.fn<StructuredDecisionClient['decide']>(async () => ({
      answers: [],
      model: 'test-model',
      provider: 'test-provider',
      raw: {},
      usage: null,
    }))
    const incompleteCreateClient = vi.fn<typeof createStructuredDecisionClient>(() => ({
      decide: incompleteDecide,
    }))

    await expect(
      dispatchAutotaggerClassifier(input, { createClient: incompleteCreateClient }),
    ).rejects.toThrow('Structured-decision shard did not cover every requested question')
    expect(incompleteDecide).toHaveBeenCalledTimes(1)

    const configuration = await getActiveClassifierConfigurationBySlugFromPrimary(TAGGING_SLUG)
    if (!configuration) throw new Error('tagging classifier configuration not seeded')
    const { digest } = await buildAutotaggerClassifierBindingsAndDigest(configuration, input)
    const claim = await claimAutotaggerReceipt({
      subject,
      digestVersion: AUTOTAGGER_RECEIPT_DIGEST_VERSION,
      digest,
      leaseSeconds: 60,
    })
    if (claim.kind !== 'claimed') throw new Error('expected the released lease to be reclaimable')
    const attempts = await listAutotaggerReceiptAttempts(claim.receiptId)
    expect(attempts[0]).toMatchObject({ outcome: 'invalid-result', completed_at: null })
    expect(attempts[0]?.failed_at).not.toBeNull()
  })

  it('leaves no failure outcome and holds the lease when decide() throws before a response arrives', async () => {
    const { subject, state, candidates } = await buildDispatchFixture(1)
    const input: AutotaggerClassifierDispatchInput = {
      subject,
      state,
      candidates,
      maxCandidates: candidates.length,
    }
    const networkErrorDecide = vi.fn<StructuredDecisionClient['decide']>(async () => {
      throw new Error('simulated network blip')
    })
    const networkErrorCreateClient = vi.fn<typeof createStructuredDecisionClient>(() => ({
      decide: networkErrorDecide,
    }))

    await expect(
      dispatchAutotaggerClassifier(input, { createClient: networkErrorCreateClient }),
    ).rejects.toThrow('simulated network blip')

    const configuration = await getActiveClassifierConfigurationBySlugFromPrimary(TAGGING_SLUG)
    if (!configuration) throw new Error('tagging classifier configuration not seeded')
    const { digest } = await buildAutotaggerClassifierBindingsAndDigest(configuration, input)
    // A plain, pre-response error is not classified as either receipt failure outcome, so the lease
    // is left live for expiry-based retry rather than released for an immediate retry loop.
    const claim = await claimAutotaggerReceipt({
      subject,
      digestVersion: AUTOTAGGER_RECEIPT_DIGEST_VERSION,
      digest,
      leaseSeconds: 60,
    })
    expect(claim.kind).toBe('in_progress')
  })

  it('rethrows a persistence-phase failure uncaught, without recording any failure outcome', async () => {
    const user = await createTestUser()
    const post = await createTestPost({ user })
    const state = await sanitizeClassifierExternalContent(
      `Dispatch classifier test content ${randomUUID()}`,
      { source: 'post', contentType: 'user_post' },
    )
    const ghostTopicId = randomUUID()
    const input: AutotaggerClassifierDispatchInput = {
      subject: { postId: post.id, rssFeedItemId: null },
      state,
      candidates: [{ topicId: ghostTopicId, name: 'Ghost Topic' }],
      maxCandidates: 1,
    }
    const fake = createFakeStructuredDecisionClient()

    await expect(
      dispatchAutotaggerClassifier(input, { createClient: fake.createClient }),
    ).rejects.toThrow(/foreign key/i)
    // A real decide() call happened (the topic FK violation only surfaces during persistence, after
    // a valid, complete answer set came back) -- this is not a vacuous pass from never reaching the
    // provider at all.
    expect(fake.decide).toHaveBeenCalledTimes(1)

    const configuration = await getActiveClassifierConfigurationBySlugFromPrimary(TAGGING_SLUG)
    if (!configuration) throw new Error('tagging classifier configuration not seeded')
    const { digest } = await buildAutotaggerClassifierBindingsAndDigest(configuration, input)
    const claim = await claimAutotaggerReceipt({
      subject: input.subject,
      digestVersion: AUTOTAGGER_RECEIPT_DIGEST_VERSION,
      digest,
      leaseSeconds: 60,
    })
    // Neither 'provider-error' nor 'invalid-result': a persistence bug is rethrown uncaught, leaving
    // the lease live for expiry-based retry rather than misclassifying it as a provider/result issue.
    expect(claim.kind).toBe('in_progress')
  })
})

describe('resolveStructuredDecisionApiKey', () => {
  it('throws for a transport with no configured API key source', () => {
    expect(() => resolveStructuredDecisionApiKey('typesafe')).toThrow(
      "Autotagger classifier dispatch has no API key source for provider 'typesafe'",
    )
  })
})
