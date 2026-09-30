import { describe, expect, it, vi } from 'vitest'
import type { ClassifierRunProviderHooks } from '@agents/classifier-runs'
import type { StructuredDecisionClient } from '@modules/structured-decisions'
import { createAutotaggerRunAdapter } from '@services/autotagger'
import { createFakeStructuredDecisionClient } from '@voucha/test-helpers/agents/autotagger/fake-structured-decision-client'
import {
  claimAutotaggerLease,
  createAutotaggerFeedItemFixture,
  createAutotaggerPostFixture,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { getSubjectClassifierRunFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
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
})
