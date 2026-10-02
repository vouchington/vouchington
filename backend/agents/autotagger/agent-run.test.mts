import { describe, expect, it, vi } from 'vitest'
import type { ClassifierRunProviderHooks } from '@agents/classifier-runs'
import type { StructuredDecisionClient } from '@modules/structured-decisions'
import { createAutotaggerAgentRunAdapter } from '@services/autotagger'
import { completeClassifierRun } from '@services/classifier-runs'
import { createFakeStructuredDecisionClient } from '@voucha/test-helpers/agents/autotagger/fake-structured-decision-client'
import {
  AUTOTAGGER_AGENT_SLUG,
  claimAutotaggerAgentLease,
  completeTaggingRunForTest,
  followTopicAsReader,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-agent-fixture'
import {
  createAutotaggerFeedItemFixture,
  createAutotaggerPostFixture,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { getSubjectClassifierRunFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { readSubjectTopicRelationFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/subject-topic-relations'
import { executeAutotaggerAgentRun } from './agent-run.mts'

const adapter = createAutotaggerAgentRunAdapter()
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

type Create = typeof createAutotaggerPostFixture | typeof createAutotaggerFeedItemFixture

/**
 * A subject with three topics, each followed by a paying member, whose first stage tagged the
 * first one, and the reasoning run leased for it: so it may ask about the other two (plus whatever
 * other followed topics other tests left in the shared database).
 */
async function leasedAgentRun(create: Create = createAutotaggerPostFixture) {
  const fixture = await create({ topicCount: 3 })
  await Promise.all(fixture.topics.map(topic => followTopicAsReader(topic.id)))
  const [applied, accepted, rejected] = fixture.topics as [
    (typeof fixture.topics)[number],
    (typeof fixture.topics)[number],
    (typeof fixture.topics)[number],
  ]
  await completeTaggingRunForTest(fixture, { [applied.id]: 0.9 })
  const lease = await claimAutotaggerAgentLease(fixture.subject)
  return { fixture, applied, accepted, rejected, lease }
}

describe.each([
  ['post', createAutotaggerPostFixture],
  ['RSS feed item', createAutotaggerFeedItemFixture],
] as const)('executeAutotaggerAgentRun for a %s (real PG)', (_name, create) => {
  it('asks only the topics the first stage did not apply, reserving one attempt, and replays without a second call', async () => {
    const { applied, accepted, rejected, lease } = await leasedAgentRun(create)
    const { createClient, decide } = reservingClient()
    const input = { adapter, lease, maxAttempts: 3, signal }

    await expect(executeAutotaggerAgentRun(input, { createClient })).resolves.toBe('persisted')
    await expect(executeAutotaggerAgentRun(input, { createClient })).resolves.toBe('replay')

    expect(decide).toHaveBeenCalledTimes(1)
    expect(createClient).toHaveBeenCalledTimes(1)
    const asked = decide.mock.calls[0]![0].questions.map(question => question.id)
    expect(asked).toEqual(lease.capturedTopicIds)
    expect(asked).toEqual(expect.arrayContaining([accepted.id, rejected.id]))
    expect(asked).not.toContain(applied.id)
    expect(await getSubjectClassifierRunFacts(lease.subject, AUTOTAGGER_AGENT_SLUG)).toMatchObject([
      { provider_attempts_started: 1, outcomes_persisted_at: expect.any(Date) },
    ])
  })

  it('adds only the topics it accepts, leaving the first stage’s tags and votes as they were', async () => {
    const { fixture, applied, accepted, rejected, lease } = await leasedAgentRun(create)
    const before = await readSubjectTopicRelationFacts(fixture.subject)
    const { createClient, decide } = reservingClient({ [accepted.id]: 0.9, [rejected.id]: 0.1 })
    await executeAutotaggerAgentRun({ adapter, lease, maxAttempts: 3, signal }, { createClient })

    const completed = await completeClassifierRun(adapter, lease)
    const replay = await completeClassifierRun(adapter, lease)

    expect(completed).toEqual({ kind: 'completed', effects: { addedTopicIds: [accepted.id] } })
    expect(replay).toEqual({ kind: 'replay' })
    const after = await readSubjectTopicRelationFacts(fixture.subject)
    expect(after.find(fact => fact.topicId === applied.id)).toEqual(
      before.find(fact => fact.topicId === applied.id),
    )
    expect(after.find(fact => fact.topicId === accepted.id)?.votes).toEqual([
      { userId: lease.resolved.actorId, score: 1 },
    ])
    expect(after.some(fact => fact.topicId === rejected.id)).toBe(false)
    expect(after).toHaveLength(2)
    expect(decide).toHaveBeenCalledTimes(1)
    expect(await readSubjectTopicRelationFacts(fixture.subject)).toEqual(after)
  })

  it('is stale, with no client built and no attempt reserved, once the content has moved on', async () => {
    const { fixture, lease } = await leasedAgentRun(create)
    const { createClient } = reservingClient()
    const moved = { ...lease, inputSha256: Buffer.alloc(32, 1) }

    await expect(
      executeAutotaggerAgentRun(
        { adapter, lease: moved, maxAttempts: 3, signal },
        { createClient },
      ),
    ).resolves.toBe('stale')

    expect(createClient).not.toHaveBeenCalled()
    expect(
      await getSubjectClassifierRunFacts(fixture.subject, AUTOTAGGER_AGENT_SLUG),
    ).toMatchObject([{ provider_attempts_started: 0, outcomes_persisted_at: null }])
  })
})
