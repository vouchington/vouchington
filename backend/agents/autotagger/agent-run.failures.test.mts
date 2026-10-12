import { describe, expect, it, vi } from 'vitest'
import type { AgentToolTurnCaller } from '@agents/_shared'
import { ModelProviderError } from '@modules/model-providers/errors'
import { SpendCapBreachError, spendCapConfig } from '@services/ai-usage'
import { createAutotaggerAgentRunAdapter } from '@services/autotagger'
import {
  makeToolTurnResult,
  TEST_MODEL_SELECTION,
} from '@voucha/test-helpers/agents/model-call-result'
import {
  AUTOTAGGER_AGENT_SLUG,
  claimAutotaggerAgentLease,
  completeTaggingRunForTest,
  followTopicAsReader,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-agent-fixture'
import { createAutotaggerPostFixture } from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { getSubjectClassifierRunFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { listAiUsageRecordsForClassifierRun } from '@voucha/test-helpers/entities/ai-usage'
import { withReservedAiUsageDay } from '@voucha/test-helpers/with-reserved-ai-usage-day'
import { executeAutotaggerAgentRun } from './agent-run.mts'

const adapter = createAutotaggerAgentRunAdapter()
const signal = new AbortController().signal

async function leasedAgentRun() {
  const fixture = await createAutotaggerPostFixture({ topicCount: 3 })
  await Promise.all(fixture.topics.map(topic => followTopicAsReader(topic.id)))
  await completeTaggingRunForTest(fixture, { [fixture.topics[0]!.id]: 0.9 })
  return { fixture, lease: await claimAutotaggerAgentLease(fixture.subject) }
}

const dependencies = (callTurn: AgentToolTurnCaller) => ({
  selection: TEST_MODEL_SELECTION,
  callTurn,
  search: () => Promise.resolve([]),
  bounds: { maxTurns: 4, maxToolCalls: 4, maxOutputTokens: 1000 },
})

const search = () =>
  makeToolTurnResult([{ name: 'lookup_candidate_topics', input: { query: 'x' } }])
const providerError = (
  code: ConstructorParameters<typeof ModelProviderError>[0],
  retryClass: 'transient' | 'permanent',
  options: Partial<ConstructorParameters<typeof ModelProviderError>[2]> = {},
) => new ModelProviderError(code, `${code} for test`, { retryClass, ...options })

async function runFacts(subject: Parameters<typeof getSubjectClassifierRunFacts>[0]) {
  const [facts] = await getSubjectClassifierRunFacts(subject, AUTOTAGGER_AGENT_SLUG)
  return facts!
}

describe('executeAutotaggerAgentRun failures (real PG)', () => {
  it('releases the run for a retry when the provider fails transiently before any turn billed', async () => {
    const { fixture, lease } = await leasedAgentRun()
    const failure = providerError('overloaded', 'transient', { retryAfterMs: 5 })
    const callTurn = vi.fn<AgentToolTurnCaller>().mockRejectedValue(failure)

    await expect(
      executeAutotaggerAgentRun({ adapter, lease, maxAttempts: 3, signal }, dependencies(callTurn)),
    ).rejects.toBe(failure)

    expect(await runFacts(fixture.subject)).toMatchObject({
      provider_attempts_started: 1,
      terminal_failure_kind: null,
      lease_token: null,
      outcomes_persisted_at: null,
    })
  })

  it('stops for good when a transient failure spends the last attempt', async () => {
    const { fixture, lease } = await leasedAgentRun()
    const callTurn = vi
      .fn<AgentToolTurnCaller>()
      .mockRejectedValue(providerError('server-error', 'transient'))

    await expect(
      executeAutotaggerAgentRun({ adapter, lease, maxAttempts: 1, signal }, dependencies(callTurn)),
    ).resolves.toBe('terminal')

    expect(await runFacts(fixture.subject)).toMatchObject({
      provider_attempts_started: 1,
      terminal_failure_kind: 'provider-error',
    })
  })

  it('refuses a further attempt once the cap is spent, without a model call', async () => {
    const { fixture, lease } = await leasedAgentRun()
    const callTurn = vi
      .fn<AgentToolTurnCaller>()
      .mockRejectedValue(providerError('server-error', 'transient'))
    await expect(
      executeAutotaggerAgentRun({ adapter, lease, maxAttempts: 2, signal }, dependencies(callTurn)),
    ).rejects.toBeInstanceOf(ModelProviderError)
    const again = await claimAutotaggerAgentLease(fixture.subject)

    await expect(
      executeAutotaggerAgentRun(
        { adapter, lease: again, maxAttempts: 1, signal },
        dependencies(callTurn),
      ),
    ).resolves.toBe('terminal')

    expect(callTurn).toHaveBeenCalledTimes(1)
    expect(await runFacts(fixture.subject)).toMatchObject({
      provider_attempts_started: 1,
      terminal_failure_kind: 'attempts-exhausted',
    })
  })

  it.each([
    ['a rejected key', providerError('authentication', 'permanent', { status: 401 })],
    ['a missing credential', providerError('client-unavailable', 'permanent')],
  ])('ends the run for good on %s', async (_name, failure) => {
    const { fixture, lease } = await leasedAgentRun()
    const callTurn = vi.fn<AgentToolTurnCaller>().mockRejectedValue(failure)

    await expect(
      executeAutotaggerAgentRun({ adapter, lease, maxAttempts: 3, signal }, dependencies(callTurn)),
    ).resolves.toBe('terminal')

    expect(await runFacts(fixture.subject)).toMatchObject({
      terminal_failure_kind: 'provider-error',
      outcomes_persisted_at: null,
    })
  })

  it('never retries after a turn has billed, even for a failure that would retry earlier (D3)', async () => {
    const { fixture, lease } = await leasedAgentRun()
    const callTurn = vi
      .fn<AgentToolTurnCaller>()
      .mockResolvedValueOnce(search())
      .mockRejectedValueOnce(providerError('overloaded', 'transient'))

    await expect(
      executeAutotaggerAgentRun({ adapter, lease, maxAttempts: 3, signal }, dependencies(callTurn)),
    ).resolves.toBe('terminal')

    expect(await runFacts(fixture.subject)).toMatchObject({
      provider_attempts_started: 1,
      terminal_failure_kind: 'provider-error',
      outcomes_persisted_at: null,
    })
    expect(await listAiUsageRecordsForClassifierRun(lease.runId)).toHaveLength(1)
  })

  it('records a billed turn it cannot use and ends the run for good', async () => {
    const { fixture, lease } = await leasedAgentRun()
    const billed = makeToolTurnResult([])
    const refusal = providerError('refusal', 'permanent', { billedResponse: billed })
    const callTurn = vi.fn<AgentToolTurnCaller>().mockRejectedValue(refusal)

    await expect(
      executeAutotaggerAgentRun({ adapter, lease, maxAttempts: 3, signal }, dependencies(callTurn)),
    ).resolves.toBe('terminal')

    expect(await runFacts(fixture.subject)).toMatchObject({
      terminal_failure_kind: 'invalid-result',
    })
    expect(await listAiUsageRecordsForClassifierRun(lease.runId)).toHaveLength(1)
  })

  it('stops billing at the run deadline and ends the run for good after a billed turn (D3)', async () => {
    const { fixture, lease } = await leasedAgentRun()
    const deadline = new AbortController()
    const callTurn = vi.fn<AgentToolTurnCaller>(() => {
      deadline.abort()
      return Promise.resolve(search())
    })

    await expect(
      executeAutotaggerAgentRun(
        { adapter, lease, maxAttempts: 3, signal: deadline.signal },
        dependencies(callTurn),
      ),
    ).resolves.toBe('terminal')

    expect(callTurn).toHaveBeenCalledTimes(1)
    expect(await runFacts(fixture.subject)).toMatchObject({
      provider_attempts_started: 1,
      terminal_failure_kind: 'provider-error',
      outcomes_persisted_at: null,
    })
  })

  it('passes the run deadline to every provider turn', async () => {
    const { lease } = await leasedAgentRun()
    const callTurn = vi.fn<AgentToolTurnCaller>(() =>
      Promise.resolve(makeToolTurnResult([{ name: 'submit_topics', input: { topic_ids: [] } }])),
    )

    await executeAutotaggerAgentRun(
      { adapter, lease, maxAttempts: 3, signal },
      dependencies(callTurn),
    )

    expect(callTurn.mock.calls[0]![1].signal).toBe(signal)
  })

  it('sends nothing and reserves no attempt once the daily spend cap is reached', async () => {
    const { fixture, lease } = await leasedAgentRun()
    const callTurn = vi.fn<AgentToolTurnCaller>()

    await withReservedAiUsageDay(0, async () => {
      await expect(
        executeAutotaggerAgentRun(
          { adapter, lease, maxAttempts: 3, signal },
          dependencies(callTurn),
        ),
      ).rejects.toBeInstanceOf(SpendCapBreachError)
    })

    expect(callTurn).not.toHaveBeenCalled()
    expect(await runFacts(fixture.subject)).toMatchObject({
      provider_attempts_started: 0,
      terminal_failure_kind: null,
      lease_token: null,
    })
  })

  it('checks the spend cap before every turn and ends the run once a billed turn is followed by a breach', async () => {
    const { fixture, lease } = await leasedAgentRun()
    await spendCapConfig.waitForInitialization()
    let restore: (() => void) | undefined
    const callTurn = vi.fn<AgentToolTurnCaller>(() => {
      restore = overrideDynamicConfigFieldsForTest(spendCapConfig, {
        enabled: true,
        daily_cap_microunits: 0,
      })
      return Promise.resolve(search())
    })

    try {
      await withReservedAiUsageDay(1_000_000_000, async () => {
        await expect(
          executeAutotaggerAgentRun(
            { adapter, lease, maxAttempts: 3, signal },
            dependencies(callTurn),
          ),
        ).resolves.toBe('terminal')
      })
    } finally {
      restore?.()
    }

    expect(callTurn).toHaveBeenCalledTimes(1)
    expect(await runFacts(fixture.subject)).toMatchObject({
      provider_attempts_started: 1,
      terminal_failure_kind: 'invalid-result',
    })
  })

  it('refuses an attempt cap that is not a positive integer', async () => {
    const { lease } = await leasedAgentRun()

    await expect(
      executeAutotaggerAgentRun(
        { adapter, lease, maxAttempts: 0, signal },
        dependencies(vi.fn<AgentToolTurnCaller>()),
      ),
    ).rejects.toThrow('attempt limit must be positive')
  })

  it('runs on the configured bounds and the topic search when none are injected', async () => {
    const { fixture, lease } = await leasedAgentRun()
    const callTurn = vi
      .fn<AgentToolTurnCaller>()
      .mockResolvedValueOnce(
        makeToolTurnResult([
          { name: 'lookup_candidate_topics', input: { query: 'zzzz-no-such-topic' } },
        ]),
      )
      .mockResolvedValueOnce(
        makeToolTurnResult([{ name: 'submit_topics', input: { topic_ids: [] } }]),
      )

    await expect(
      executeAutotaggerAgentRun(
        { adapter, lease, maxAttempts: 3, signal },
        { selection: TEST_MODEL_SELECTION, callTurn },
      ),
    ).resolves.toBe('persisted')

    expect(callTurn).toHaveBeenCalledTimes(2)
    expect(callTurn.mock.calls[0]![0].maxOutputTokens).toBe(3000)
    expect(JSON.stringify(callTurn.mock.calls[1]![0].messages.at(-1))).toContain('topics')
    expect(await runFacts(fixture.subject)).toMatchObject({ provider_attempts_started: 1 })
  })
})
