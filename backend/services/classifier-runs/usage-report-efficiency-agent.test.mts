import { classifierRunUsage as run } from '@voucha/test-helpers/classifier-run-usage'
import { describe, expect, it } from 'vitest'
import {
  summarizeClassifierContentVersions,
  summarizeClassifierEfficiency,
} from './usage-report-efficiency.mts'
import type { ClassifierRunUsage } from './usage-report-types.mts'

describe('summarizeClassifierEfficiency for an agent classifier (deterministic fixtures)', () => {
  const agent = (overrides: Partial<ClassifierRunUsage> = {}) =>
    run({
      classifier: 'autotagger-agent',
      primitive: 'agent',
      batchId: null,
      promptVersionId: null,
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
      providerCalls: 3,
      ...overrides,
    })

  it('counts billed turns per run and leaves the agent out of the one-call KPI', () => {
    const [efficiency] = summarizeClassifierEfficiency(
      summarizeClassifierContentVersions([
        agent({ runId: 'a', subjectId: 'one' }),
        agent({ runId: 'b', subjectId: 'two', providerCalls: 5 }),
      ]),
    )

    expect(efficiency).toMatchObject({
      runs: 2,
      providerCalls: 8,
      agentRuns: 2,
      agentTurns: 8,
      maxAgentTurnsPerRun: 5,
      maxProviderCallsPerRun: 0,
      runsOverOneCall: 0,
    })
  })

  it('keeps single-call runs of other classifiers on the one-call KPI', () => {
    const [agentEfficiency, postEfficiency] = summarizeClassifierEfficiency(
      summarizeClassifierContentVersions([
        agent({}),
        run({ classifier: 'post-classifier', providerCalls: 2 }),
      ]),
    )

    expect(agentEfficiency).toMatchObject({ classifier: 'autotagger-agent', agentRuns: 1 })
    expect(postEfficiency).toMatchObject({
      classifier: 'post-classifier',
      agentRuns: 0,
      maxProviderCallsPerRun: 2,
      runsOverOneCall: 1,
    })
  })

  it('treats an incomplete agent run with no durable outcomes as able to call the provider', () => {
    const versions = summarizeClassifierContentVersions([
      agent({ outcome: 'incomplete', outcomesPersisted: false }),
      agent({ runId: 'b', subjectId: 'done' }),
    ])

    expect(versions.map(version => version.unfinishedRuns)).toEqual([0, 1])
  })
})
