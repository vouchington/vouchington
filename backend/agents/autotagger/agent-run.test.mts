import { describe, expect, it, vi } from 'vitest'
import type { AgentToolTurnCaller } from '@agents/_shared'
import { createAutotaggerAgentRunAdapter } from '@services/autotagger'
import { completeClassifierRun } from '@services/classifier-runs'
import {
  makeToolTurnResult,
  TEST_MODEL_SELECTION,
} from '@voucha/test-helpers/agents/model-call-result'
import {
  AUTOTAGGER_AGENT_SLUG,
  claimAutotaggerAgentLease,
  completeTaggingRunForTest,
  followTopicAsReader,
  removeCapturedTopicsForTest,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-agent-fixture'
import {
  createAutotaggerFeedItemFixture,
  createAutotaggerPostFixture,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { getSubjectClassifierRunFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { readSubjectTopicRelationFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/subject-topic-relations'
import { listAiUsageRecordsForClassifierRun } from '@voucha/test-helpers/entities/ai-usage'
import { executeAutotaggerAgentRun } from './agent-run.mts'

const adapter = createAutotaggerAgentRunAdapter()
const signal = new AbortController().signal

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

/** A caller that submits `ids` on every turn it is called. */
function submitting(...ids: string[]) {
  return vi.fn<AgentToolTurnCaller>(() =>
    Promise.resolve(makeToolTurnResult([{ name: 'submit_topics', input: { topic_ids: ids } }])),
  )
}

const dependencies = (callTurn: AgentToolTurnCaller) => ({
  selection: TEST_MODEL_SELECTION,
  callTurn,
  search: () => Promise.resolve([]),
  bounds: { maxTurns: 4, maxToolCalls: 2, maxOutputTokens: 1000 },
})

describe.each([
  ['post', createAutotaggerPostFixture],
  ['RSS feed item', createAutotaggerFeedItemFixture],
] as const)('executeAutotaggerAgentRun for a %s (real PG)', (_name, create) => {
  it('offers only the topics the first stage did not apply, reserves one attempt and replays without a second call', async () => {
    const { applied, accepted, rejected, lease } = await leasedAgentRun(create)
    const callTurn = submitting()
    const input = { adapter, lease, maxAttempts: 3, signal }

    await expect(executeAutotaggerAgentRun(input, dependencies(callTurn))).resolves.toBe(
      'persisted',
    )
    await expect(executeAutotaggerAgentRun(input, dependencies(callTurn))).resolves.toBe('replay')

    expect(callTurn).toHaveBeenCalledTimes(1)
    const { messages, tools } = callTurn.mock.calls[0]![0]
    const first = JSON.stringify(messages[0])
    expect(first).toContain(accepted.id)
    expect(first).toContain(rejected.id)
    expect(first).not.toContain(applied.id)
    expect(tools.map(tool => tool.name)).toEqual(['search_topics', 'submit_topics'])
    expect(lease.capturedTopicIds).toEqual(expect.arrayContaining([accepted.id, rejected.id]))
    expect(await getSubjectClassifierRunFacts(lease.subject, AUTOTAGGER_AGENT_SLUG)).toMatchObject([
      {
        decision_batch_id: null,
        provider_attempts_started: 1,
        outcomes_persisted_at: expect.any(Date),
      },
    ])
  })

  it('adds only the topics it reports, leaving the first stage’s tags and votes as they were', async () => {
    const { fixture, applied, accepted, rejected, lease } = await leasedAgentRun(create)
    const before = await readSubjectTopicRelationFacts(fixture.subject)
    const callTurn = submitting(accepted.id)
    await executeAutotaggerAgentRun(
      { adapter, lease, maxAttempts: 3, signal },
      dependencies(callTurn),
    )

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
  })

  it('bills every turn to the run in the ledger, under its own workload', async () => {
    const { accepted, lease } = await leasedAgentRun(create)
    const callTurn = vi
      .fn<AgentToolTurnCaller>()
      .mockResolvedValueOnce(makeToolTurnResult([{ name: 'search_topics', input: { query: 'x' } }]))
      .mockResolvedValueOnce(
        makeToolTurnResult([{ name: 'submit_topics', input: { topic_ids: [accepted.id] } }]),
      )
    await executeAutotaggerAgentRun(
      { adapter, lease, maxAttempts: 3, signal },
      dependencies(callTurn),
    )

    expect(await listAiUsageRecordsForClassifierRun(lease.runId)).toMatchObject([
      { classifier_run_id: lease.runId, agent_slug: AUTOTAGGER_AGENT_SLUG },
      { classifier_run_id: lease.runId, agent_slug: AUTOTAGGER_AGENT_SLUG },
    ])
    expect(await getSubjectClassifierRunFacts(lease.subject, AUTOTAGGER_AGENT_SLUG)).toMatchObject([
      { provider_attempts_started: 1 },
    ])
  })

  it('is stale, with no model call and no attempt reserved, once the content has moved on', async () => {
    const { fixture, lease } = await leasedAgentRun(create)
    const callTurn = submitting()
    const moved = { ...lease, inputSha256: Buffer.alloc(32, 1) }

    await expect(
      executeAutotaggerAgentRun(
        { adapter, lease: moved, maxAttempts: 3, signal },
        dependencies(callTurn),
      ),
    ).resolves.toBe('stale')

    expect(callTurn).not.toHaveBeenCalled()
    expect(
      await getSubjectClassifierRunFacts(fixture.subject, AUTOTAGGER_AGENT_SLUG),
    ).toMatchObject([{ provider_attempts_started: 0, outcomes_persisted_at: null }])
  })

  it('persists no facts and calls no model when every captured topic was removed', async () => {
    const { lease } = await leasedAgentRun(create)
    await removeCapturedTopicsForTest(lease.runId)
    const callTurn = submitting()
    const input = { adapter, lease: { ...lease, capturedTopicIds: [] }, maxAttempts: 3, signal }

    await expect(executeAutotaggerAgentRun(input, dependencies(callTurn))).resolves.toBe(
      'persisted',
    )

    expect(callTurn).not.toHaveBeenCalled()
    await expect(completeClassifierRun(adapter, input.lease)).resolves.toEqual({
      kind: 'completed',
      effects: { addedTopicIds: [] },
    })
  })

  it('calls the provider and model it was given', async () => {
    const { lease } = await leasedAgentRun(create)
    const callTurn = submitting()
    await executeAutotaggerAgentRun(
      { adapter, lease, maxAttempts: 3, signal },
      dependencies(callTurn),
    )
    expect(callTurn.mock.calls[0]![1]).toMatchObject({ selection: TEST_MODEL_SELECTION })
  })
})
