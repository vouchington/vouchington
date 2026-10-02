import { describe, expect, it } from 'vitest'
import { summarizeClassifierUsage } from './usage-report-summary.mts'
import type { ClassifierRunUsage } from './usage-report-types.mts'

const BASE: ClassifierRunUsage = {
  runId: 'run',
  classifier: 'post-classifier',
  primitive: 'noul',
  batchId: 'batch',
  promptVersionId: 'prompt-1',
  provider: 'TypeSafe',
  model: 'typesafe/jev-1.13',
  scopeCategory: 'global',
  scopeCommunityId: null,
  shardCount: 1,
  candidateCount: 3,
  outcome: 'completed',
  attemptsStarted: 1,
  retries: 0,
  sweepEnqueues: 0,
  providerCalls: 1,
  attemptsWithoutRecordedResponse: 0,
  inputTokens: 100,
  cachedInputTokens: 40,
  outputTokens: 10,
  pricedCalls: 1,
  unpricedCalls: 0,
  costMicrounits: '2000',
  latencyMsTotal: 200,
  latencyMsMax: 200,
  latencySamples: 1,
  localDetector: null,
}

const run = (overrides: Partial<ClassifierRunUsage>): ClassifierRunUsage => ({
  ...BASE,
  ...overrides,
})

describe('summarizeClassifierUsage (deterministic fixtures)', () => {
  it('sums the fan-out and the provider figures of runs that share a group', () => {
    const groups = summarizeClassifierUsage([
      run({}),
      run({
        outcome: 'failed:attempts-exhausted',
        attemptsStarted: 3,
        retries: 2,
        sweepEnqueues: 2,
        providerCalls: 1,
        attemptsWithoutRecordedResponse: 2,
        shardCount: 0,
        candidateCount: 0,
        latencyMsTotal: 700,
        latencyMsMax: 700,
        costMicrounits: '500',
        pricedCalls: 0,
        unpricedCalls: 1,
      }),
      run({ providerCalls: 2, shardCount: 2, latencyMsTotal: 90, latencyMsMax: 60 }),
    ])

    expect(groups).toEqual([
      {
        classifier: 'post-classifier',
        primitive: 'noul',
        provider: 'TypeSafe',
        model: 'typesafe/jev-1.13',
        promptVersionId: 'prompt-1',
        scopeCategory: 'global',
        runs: 3,
        outcomes: { completed: 2, 'failed:attempts-exhausted': 1 },
        attemptsStarted: 5,
        retries: 2,
        sweepEnqueues: 2,
        providerCalls: 4,
        attemptsWithoutRecordedResponse: 2,
        shards: 3,
        candidates: 6,
        inputTokens: 300,
        cachedInputTokens: 120,
        outputTokens: 30,
        pricedCalls: 2,
        unpricedCalls: 1,
        costMicrounits: '4500',
        latencyMsTotal: 990,
        latencyMsMax: 700,
        latencySamples: 3,
        localDetectorCalls: 0,
        localCostMicrounits: '0',
      },
    ])
  })

  it('adds costs exactly, past the range a float can hold', () => {
    const [group] = summarizeClassifierUsage([
      run({ costMicrounits: '9007199254740993' }),
      run({ costMicrounits: '2' }),
    ])

    expect(group!.costMicrounits).toBe('9007199254740995')
  })

  it('counts a local detector run apart from provider calls, at zero cost', () => {
    const [group] = summarizeClassifierUsage([
      run({
        batchId: null,
        promptVersionId: null,
        provider: null,
        model: null,
        shardCount: 0,
        candidateCount: 0,
        attemptsStarted: 0,
        providerCalls: 0,
        pricedCalls: 0,
        costMicrounits: '0',
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        latencyMsTotal: 0,
        latencyMsMax: null,
        latencySamples: 0,
        localDetector: 'detector',
      }),
    ])

    expect(group).toMatchObject({
      runs: 1,
      localDetectorCalls: 1,
      localCostMicrounits: '0',
      providerCalls: 0,
      shards: 0,
      costMicrounits: '0',
      latencyMsMax: null,
    })
  })

  it('keeps a group per prompt version, scope and classifier, in a stable order', () => {
    const groups = summarizeClassifierUsage([
      run({ classifier: 'topic-classifier', promptVersionId: 'prompt-2' }),
      run({ scopeCategory: 'community' }),
      run({ promptVersionId: 'prompt-2' }),
      run({}),
      run({ localDetector: 'detector' }),
    ])

    expect(
      groups.map(({ classifier, promptVersionId, scopeCategory, runs }) => [
        classifier,
        promptVersionId,
        scopeCategory,
        runs,
      ]),
    ).toEqual([
      ['post-classifier', 'prompt-1', 'community', 1],
      ['post-classifier', 'prompt-1', 'global', 2],
      ['post-classifier', 'prompt-2', 'global', 1],
      ['topic-classifier', 'prompt-2', 'global', 1],
    ])
    expect(groups.find(group => group.runs === 2)).toMatchObject({
      localDetectorCalls: 1,
      localCostMicrounits: '0',
      providerCalls: 2,
    })
  })

  it('reports no groups for no runs', () => {
    expect(summarizeClassifierUsage([])).toEqual([])
  })
})
