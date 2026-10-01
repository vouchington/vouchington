import { describe, expect, it, vi } from 'vitest'
import type { ClassifierRunProviderHooks } from '@agents/classifier-runs'
import type {
  StructuredDecisionClient,
  StructuredDecisionFetch,
} from '@modules/structured-decisions'
import { createAutotaggerRunAdapter } from '@services/autotagger'
import {
  claimClassifierRun,
  completeClassifierRun,
  listIncompleteClassifierRuns,
  persistClassifierRunOutcomes,
} from '@services/classifier-runs'
import { createFakeStructuredDecisionClient } from '@voucha/test-helpers/agents/autotagger/fake-structured-decision-client'
import { applyAutotaggerEffectsWithoutDecisionForTest } from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-effects'
import {
  claimAutotaggerLease,
  createAutotaggerFeedItemFixture,
  createAutotaggerPostFixture,
  embedAutotaggerFeedItem,
  reviseAutotaggerFeedItem,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import {
  expireClassifierRunLeaseForTest,
  getSubjectClassifierRunFacts,
  getSubjectClassifierRunRequestFacts,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { readSubjectTopicRelationFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/subject-topic-relations'
import { hardDeleteTestTopic } from '@voucha/test-helpers/entities/topics/deletion'
import { createAutotaggerClient } from './classifier-run-client.mts'
import { executeAutotaggerRun } from './classifier-run.mts'

const adapter = createAutotaggerRunAdapter()
const signal = new AbortController().signal

/** A client that reserves its provider attempt through the hook first, as a real one does. */
function reservingClient(probabilities: Record<string, number> = {}) {
  const fake = createFakeStructuredDecisionClient(probabilities)
  const createClient = vi.fn<(hooks: ClassifierRunProviderHooks) => StructuredDecisionClient>(
    hooks => ({
      decide: async (request, decideSignal) => {
        await hooks.beforeAttempt()
        return fake.client.decide(request, decideSignal)
      },
    }),
  )
  return { ...fake, createClient }
}

describe('executeAutotaggerRun (real PG)', () => {
  it('reserves one provider attempt, persists the answers, and replays without calling again', async () => {
    const fixture = await createAutotaggerPostFixture()
    const lease = await claimAutotaggerLease(fixture)
    const { createClient, decide } = reservingClient()
    const input = { adapter, lease, maxAttempts: 3, signal }

    await expect(executeAutotaggerRun(input, { createClient })).resolves.toBe('persisted')
    await expect(executeAutotaggerRun(input, { createClient })).resolves.toBe('replay')

    expect(decide).toHaveBeenCalledTimes(1)
    expect(createClient).toHaveBeenCalledTimes(1)
    expect(await getSubjectClassifierRunFacts(fixture.subject)).toMatchObject([
      { provider_attempts_started: 1, outcomes_persisted_at: expect.any(Date) },
    ])
  })

  it('asks exactly the topics the run captured', async () => {
    const fixture = await createAutotaggerFeedItemFixture({ topicCount: 3 })
    const lease = await claimAutotaggerLease(fixture)
    const { createClient, decide } = reservingClient()

    await executeAutotaggerRun({ adapter, lease, maxAttempts: 3, signal }, { createClient })

    const request = decide.mock.calls[0]![0]
    expect(request.questions.map(question => question.id)).toEqual(lease.capturedTopicIds)
  })

  it('is stale, with no client built and no attempt reserved, once the post content has moved on', async () => {
    const fixture = await createAutotaggerPostFixture()
    const lease = await claimAutotaggerLease(fixture)
    const { createClient } = reservingClient()
    const moved = { ...lease, inputSha256: Buffer.alloc(32, 1) }

    await expect(
      executeAutotaggerRun({ adapter, lease: moved, maxAttempts: 3, signal }, { createClient }),
    ).resolves.toBe('stale')

    expect(createClient).not.toHaveBeenCalled()
    expect(await getSubjectClassifierRunFacts(fixture.subject)).toMatchObject([
      { provider_attempts_started: 0, outcomes_persisted_at: null },
    ])
  })

  it('is stale once the RSS feed item content has moved on', async () => {
    const lease = await claimAutotaggerLease(await createAutotaggerFeedItemFixture())
    const { createClient } = reservingClient()
    const moved = { ...lease, inputSha256: Buffer.alloc(32, 2) }

    await expect(
      executeAutotaggerRun({ adapter, lease: moved, maxAttempts: 3, signal }, { createClient }),
    ).resolves.toBe('stale')
    expect(createClient).not.toHaveBeenCalled()
  })

  it('is stale when the subject no longer exists', async () => {
    const lease = await claimAutotaggerLease(await createAutotaggerFeedItemFixture())
    const { createClient } = reservingClient()
    const gone = {
      ...lease,
      subject: { postId: null, rssFeedItemId: '018f0000-0000-7000-8000-000000000000' },
    } as const

    await expect(
      executeAutotaggerRun({ adapter, lease: gone, maxAttempts: 3, signal }, { createClient }),
    ).resolves.toBe('stale')
  })

  describe('once every captured topic was hard-deleted', () => {
    /** Reserves and leases a run, deletes the topics it captured, and reclaims it as the sweep would. */
    async function reclaimAfterDeletingEveryTopic() {
      const fixture = await createAutotaggerPostFixture({ topicCount: 2 })
      const first = await claimAutotaggerLease(fixture)
      await Promise.all(first.capturedTopicIds.map(topicId => hardDeleteTestTopic(topicId)))
      await expireClassifierRunLeaseForTest(first.runId)
      const claim = await claimClassifierRun(adapter, {
        runId: first.runId,
        subject: first.subject,
        inputSha256: first.inputSha256,
        configurationSha256: first.resolved.configurationSha256,
        leaseSeconds: 60,
      })
      if (claim.kind !== 'claimed') throw new Error(`Expected a claim, got ${claim.kind}`)
      return { fixture, first, lease: claim.lease }
    }

    it('completes with no provider call, no attempt and no votes, and leaves the sweep nothing to rescan', async () => {
      const { fixture, first, lease } = await reclaimAfterDeletingEveryTopic()
      const fetch = vi.fn<StructuredDecisionFetch>()
      const createClient = vi.fn<(hooks: ClassifierRunProviderHooks) => StructuredDecisionClient>(
        hooks =>
          createAutotaggerClient(
            {
              postId: fixture.post.id,
              modelProvider: 'openrouter',
              beforeAttempt: hooks.beforeAttempt,
            },
            { fetch, apiKey: 'test-key' },
          ),
      )
      const input = { adapter, lease, maxAttempts: 3, signal }

      expect(lease.capturedTopicIds).toEqual([])
      await expect(executeAutotaggerRun(input, { createClient })).resolves.toBe('persisted')
      await expect(completeClassifierRun(adapter, lease)).resolves.toEqual({
        kind: 'completed',
        effects: { addedTopicIds: [] },
      })

      expect(createClient).not.toHaveBeenCalled()
      expect(fetch).not.toHaveBeenCalled()
      expect(await getSubjectClassifierRunFacts(fixture.subject)).toMatchObject([
        {
          provider_attempts_started: 0,
          outcomes_persisted_at: expect.any(Date),
          completed_at: expect.any(Date),
          terminal_failed_at: null,
          lease_token: null,
        },
      ])
      expect(await getSubjectClassifierRunRequestFacts(fixture.subject)).toMatchObject([
        { run_id: first.runId, no_work_at: null, stale_at: null },
      ])
      const incomplete: string[] = []
      let after: string | null = null
      do {
        const page = await listIncompleteClassifierRuns(after)
        incomplete.push(...page.items.map(run => run.runId))
        after = page.next
      } while (after)
      expect(incomplete).not.toContain(first.runId)
    })

    it('replays as persisted without building a client', async () => {
      const { lease } = await reclaimAfterDeletingEveryTopic()
      const { createClient } = reservingClient()
      const input = { adapter, lease, maxAttempts: 3, signal }

      await expect(executeAutotaggerRun(input, { createClient })).resolves.toBe('persisted')
      await expect(executeAutotaggerRun(input, { createClient })).resolves.toBe('replay')
      expect(createClient).not.toHaveBeenCalled()
    })
  })

  describe('a run that still has captured topics', () => {
    it('refuses to persist without a remote decision', async () => {
      const lease = await claimAutotaggerLease(await createAutotaggerPostFixture())

      expect(lease.capturedTopicIds.length).toBeGreaterThan(0)
      await expect(persistClassifierRunOutcomes(adapter, { lease })).rejects.toThrow(
        'requires a complete remote output',
      )
    })

    it('refuses to apply effects without a remote decision', async () => {
      const lease = await claimAutotaggerLease(await createAutotaggerPostFixture())

      await expect(applyAutotaggerEffectsWithoutDecisionForTest(lease)).rejects.toThrow(
        'no remote decision to apply',
      )
    })
  })
  describe('applying the decision to the subject revision it classified', () => {
    const answerAll = (topicIds: readonly string[], probability: number) =>
      Object.fromEntries(topicIds.map(topicId => [topicId, probability]))

    it('tags the subject and replays a completed run without a provider call or a second write', async () => {
      const fixture = await createAutotaggerPostFixture({ topicCount: 2 })
      const lease = await claimAutotaggerLease(fixture)
      const { createClient, decide } = reservingClient(answerAll(lease.capturedTopicIds, 0.9))
      await executeAutotaggerRun({ adapter, lease, maxAttempts: 3, signal }, { createClient })

      const completed = await completeClassifierRun(adapter, lease)
      const tagged = await readSubjectTopicRelationFacts(fixture.subject)
      const replay = await completeClassifierRun(adapter, lease)

      expect(completed).toEqual({
        kind: 'completed',
        effects: { addedTopicIds: lease.capturedTopicIds.toSorted() },
      })
      expect(replay).toEqual({ kind: 'replay' })
      expect(tagged.map(fact => fact.topicId)).toEqual(lease.capturedTopicIds.toSorted())
      expect(tagged.every(fact => fact.votes.length === 1)).toBe(true)
      expect(decide).toHaveBeenCalledTimes(1)
      expect(await readSubjectTopicRelationFacts(fixture.subject)).toEqual(tagged)
    })

    it('rolls every relation, vote and the receipt back when a later effect fails, then applies each once', async () => {
      const fixture = await createAutotaggerPostFixture({ topicCount: 2 })
      const lease = await claimAutotaggerLease(fixture)
      const { createClient, decide } = reservingClient(answerAll(lease.capturedTopicIds, 0.9))
      await executeAutotaggerRun({ adapter, lease, maxAttempts: 3, signal }, { createClient })
      const failing: typeof adapter = {
        ...adapter,
        applyEffects: async (query, current, outcomes) => {
          await adapter.applyEffects(query, current, outcomes)
          throw new Error('a later effect failed')
        },
      }

      await expect(completeClassifierRun(failing, lease)).rejects.toThrow('a later effect failed')
      expect(await readSubjectTopicRelationFacts(fixture.subject)).toEqual([])
      expect(await getSubjectClassifierRunFacts(fixture.subject)).toMatchObject([
        { completed_at: null },
      ])

      await expect(completeClassifierRun(adapter, lease)).resolves.toMatchObject({
        kind: 'completed',
      })
      const tagged = await readSubjectTopicRelationFacts(fixture.subject)
      expect(tagged.map(fact => fact.topicId)).toEqual(lease.capturedTopicIds.toSorted())
      expect(tagged.every(fact => fact.votes.length === 1)).toBe(true)
      expect(decide).toHaveBeenCalledTimes(1)
    })

    it('lets an older revision result neither tag nor change what the newer revision settled', async () => {
      const fixture = await createAutotaggerFeedItemFixture({ topicCount: 2 })
      const older = await claimAutotaggerLease(fixture)
      const reject = reservingClient(answerAll(older.capturedTopicIds, 0.1))
      await expect(
        executeAutotaggerRun(
          { adapter, lease: older, maxAttempts: 3, signal },
          { createClient: reject.createClient },
        ),
      ).resolves.toBe('persisted')
      const inputSha256 = await reviseAutotaggerFeedItem(fixture.itemId)
      await embedAutotaggerFeedItem(fixture.itemId, fixture.embedding)
      const newer = await claimAutotaggerLease({ ...fixture, inputSha256 })
      const accept = reservingClient(answerAll(newer.capturedTopicIds, 0.9))
      await expect(
        executeAutotaggerRun(
          { adapter, lease: newer, maxAttempts: 3, signal },
          { createClient: accept.createClient },
        ),
      ).resolves.toBe('persisted')
      await completeClassifierRun(adapter, newer)
      const settled = await readSubjectTopicRelationFacts(fixture.subject)

      await expect(completeClassifierRun(adapter, older)).resolves.toEqual({ kind: 'stale' })

      expect(settled.map(fact => fact.topicId)).toEqual(newer.capturedTopicIds.toSorted())
      expect(settled.flatMap(fact => fact.votes.map(vote => vote.score))).toEqual([1, 1])
      expect(await readSubjectTopicRelationFacts(fixture.subject)).toEqual(settled)
    })
  })
})
