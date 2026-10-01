import { describe, expect, it, vi } from 'vitest'
import type { ClassifierRunProviderHooks } from '@agents/classifier-runs'
import { beginTransaction } from '@data-stores/psql'
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
import {
  claimAutotaggerLease,
  createAutotaggerFeedItemFixture,
  createAutotaggerPostFixture,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import {
  expireClassifierRunLeaseForTest,
  getSubjectClassifierRunFacts,
  getSubjectClassifierRunRequestFacts,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { hardDeleteTestTopic } from '@voucha/test-helpers/entities/topics/deletion'
import { createAutotaggerClient } from './classifier-run-client.mts'
import { executeAutotaggerRun } from './classifier-run.mts'

const adapter = createAutotaggerRunAdapter()
const signal = new AbortController().signal

/** A client that reserves its provider attempt through the hook first, as a real one does. */
function reservingClient() {
  const fake = createFakeStructuredDecisionClient()
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
        effects: { appliedTopicIds: [] },
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
      await using query = await beginTransaction()

      await expect(
        adapter.applyEffects(query, lease, { local: null, remoteDecision: null }),
      ).rejects.toThrow('no remote decision to apply')
    })
  })
})
