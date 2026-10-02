import { completeClassifierRun, reserveClassifierRun } from '@services/classifier-runs'
import { getAutotaggerAgentSystemUserId } from '@services/users/system-users'
import { AUTOTAGGER_AGENT_SLUG } from '@voucha/types/entities/autotagger-agent'
import {
  claimAutotaggerAgentLease,
  completeTaggingRunForTest,
  followTopicAsReader,
  persistTopicRunAnswers,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-agent-fixture'
import { requestAutotaggerAgentRun } from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-agent-service-calls'
import {
  claimAutotaggerLease,
  createAutotaggerFeedItemFixture,
  createAutotaggerPostFixture,
  reviseAutotaggerFeedItem,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import {
  getClassifierRunCandidateTopicIdsForTest,
  getSubjectClassifierRunFacts,
  getSubjectClassifierRunRequestFacts,
  markClassifierRunTerminalForTest,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { softDeleteTopic } from '@voucha/test-helpers/entities/topics/deletion'
import { afterEach, describe, expect, it } from 'vitest'
import { autotaggerPaidLimitsConfig } from '../limits-config.mts'
import { createAutotaggerAgentRunAdapter } from './adapter.mts'
import { resolveAutotaggerAgentRunConfiguration } from './configuration.mts'
import { resolveAutotaggerRunConfiguration } from '../configuration.mts'
import { createAutotaggerRunAdapter } from '../adapter.mts'

const adapter = createAutotaggerAgentRunAdapter()
const restores: Array<() => void> = []

/** The operator kill switch, restored after the test. */
function switchOffAutotagging() {
  restores.push(overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, { enabled: false }))
}

/** The reasoning pass's request rows for a subject, as the sweep and the dispatcher see them. */
function agentRequests(subject: Parameters<typeof getSubjectClassifierRunRequestFacts>[0]) {
  return getSubjectClassifierRunRequestFacts(subject, AUTOTAGGER_AGENT_SLUG)
}

describe('C7 request and gate (real PG)', () => {
  afterEach(() => restores.splice(0).forEach(restore => restore()))

  it('requests the reasoning pass in the first stage’s completion, for the content it completed', async () => {
    const fixture = await createAutotaggerPostFixture()
    expect(await agentRequests(fixture.subject)).toEqual([])

    const { lease } = await completeTaggingRunForTest(fixture)

    expect(await agentRequests(fixture.subject)).toMatchObject([
      { input_sha256: lease.inputSha256, run_id: null, no_work_at: null, stale_at: null },
    ])
  })

  it('requests it once even when the first stage tags nothing or its completion replays', async () => {
    const fixture = await createAutotaggerFeedItemFixture()
    const { lease, effects } = await completeTaggingRunForTest(fixture)

    await expect(completeClassifierRun(createAutotaggerRunAdapter(), lease)).resolves.toEqual({
      kind: 'replay',
    })

    expect(effects.addedTopicIds).toEqual([])
    expect(await agentRequests(fixture.subject)).toHaveLength(1)
  })

  it('requests it when every topic the first stage captured was deleted before it applied', async () => {
    const fixture = await createAutotaggerPostFixture({ topicCount: 2 })
    const lease = await claimAutotaggerLease(fixture)
    await persistTopicRunAnswers(
      createAutotaggerRunAdapter(),
      lease,
      Object.fromEntries(lease.capturedTopicIds.map(topicId => [topicId, 0.9])),
    )
    await Promise.all(
      lease.capturedTopicIds.map(topicId => softDeleteTopic(topicId, fixture.user.id)),
    )

    await completeClassifierRun(createAutotaggerRunAdapter(), lease)

    expect(await agentRequests(fixture.subject)).toHaveLength(1)
  })

  it('does not run before the first stage completed at the content, then reserves once it has', async () => {
    const fixture = await createAutotaggerPostFixture()
    await followTopicAsReader(fixture.topics[0]!.id)
    await requestAutotaggerAgentRun(fixture)
    expect(await reserveClassifierRun(adapter, fixture.subject)).toEqual({ kind: 'not-ready' })

    await completeTaggingRunForTest(fixture)

    expect(await reserveClassifierRun(adapter, fixture.subject)).toMatchObject({ kind: 'reserved' })
  })

  it('waits while the first stage has a run that has not completed', async () => {
    const fixture = await createAutotaggerPostFixture()
    await followTopicAsReader(fixture.topics[0]!.id)
    await claimAutotaggerLease(fixture)
    await requestAutotaggerAgentRun(fixture)

    expect(await reserveClassifierRun(adapter, fixture.subject)).toEqual({ kind: 'not-ready' })
  })

  it('never runs after a first stage that failed terminally', async () => {
    const fixture = await createAutotaggerPostFixture()
    await followTopicAsReader(fixture.topics[0]!.id)
    const lease = await claimAutotaggerLease(fixture)
    await markClassifierRunTerminalForTest(lease.runId, 'provider-error')
    await requestAutotaggerAgentRun(fixture)

    expect(await reserveClassifierRun(adapter, fixture.subject)).toEqual({ kind: 'not-ready' })
  })

  it('keys the run on the content the first stage completed, never on newer content', async () => {
    const fixture = await createAutotaggerFeedItemFixture()
    await followTopicAsReader(fixture.topics[0]!.id)
    await completeTaggingRunForTest(fixture)
    await reviseAutotaggerFeedItem(fixture.itemId)

    expect(await reserveClassifierRun(adapter, fixture.subject)).toEqual({ kind: 'not-ready' })
  })
})

describe('C7 reservation (real PG)', () => {
  afterEach(() => restores.splice(0).forEach(restore => restore()))

  it('asks about the paid-followed topics the first stage did not apply, once per content version', async () => {
    const fixture = await createAutotaggerPostFixture({ topicCount: 3 })
    const lease = await claimAutotaggerLease(fixture)
    const [applied, ...rest] = lease.capturedTopicIds as [string, ...string[]]
    await Promise.all(fixture.topics.map(topic => followTopicAsReader(topic.id)))
    await persistTopicRunAnswers(createAutotaggerRunAdapter(), lease, { [applied]: 0.9 })
    await completeClassifierRun(createAutotaggerRunAdapter(), lease)

    const first = await reserveClassifierRun(adapter, fixture.subject)
    const second = await reserveClassifierRun(adapter, fixture.subject)

    if (first.kind !== 'reserved' || second.kind !== 'reserved') throw new Error('Expected runs')
    expect(second.run.runId).toBe(first.run.runId)
    expect(
      (await getSubjectClassifierRunFacts(fixture.subject, AUTOTAGGER_AGENT_SLUG)).length,
    ).toBe(1)
    const captured = await getClassifierRunCandidateTopicIdsForTest(first.run.runId)
    expect(captured).not.toContain(applied)
    expect(captured).toEqual(expect.arrayContaining(rest))
    expect(await agentRequests(fixture.subject)).toMatchObject([
      { run_id: first.run.runId, no_work_at: null },
    ])
  })

  it('settles as no work when the operator kill switch is off', async () => {
    const fixture = await createAutotaggerPostFixture()
    await followTopicAsReader(fixture.topics[0]!.id)
    await completeTaggingRunForTest(fixture)
    switchOffAutotagging()

    expect(await reserveClassifierRun(adapter, fixture.subject)).toEqual({ kind: 'no-work' })
    expect(await getSubjectClassifierRunFacts(fixture.subject, AUTOTAGGER_AGENT_SLUG)).toEqual([])
  })

  it('leases a run whose actor and identity are its own, not the first stage’s', async () => {
    const fixture = await createAutotaggerPostFixture()
    await followTopicAsReader(fixture.topics[0]!.id)
    await completeTaggingRunForTest(fixture)

    const lease = await claimAutotaggerAgentLease(fixture.subject)

    const [agent, firstStage] = await Promise.all([
      resolveAutotaggerAgentRunConfiguration(),
      resolveAutotaggerRunConfiguration(),
    ])
    expect(lease.resolved.actorId).toBe(await getAutotaggerAgentSystemUserId())
    expect(agent?.actorId).not.toBe(firstStage?.actorId)
    expect(agent?.configurationSha256.equals(firstStage!.configurationSha256)).toBe(false)
    expect(agent?.configuration.classifierId).not.toBe(firstStage?.configuration.classifierId)
  })
})
