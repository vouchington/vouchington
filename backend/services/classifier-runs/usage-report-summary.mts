import type { ClassifierRunUsage, ClassifierUsageGroup } from './usage-report-types.mts'

/**
 * Sums runs by classifier, prompt version and scope category. Pure: every figure is read from the
 * runs it is given. Nothing here estimates, extrapolates or compares against a baseline, so no
 * savings figure can be invented from it.
 */
export function summarizeClassifierUsage(
  runs: readonly ClassifierRunUsage[],
): ClassifierUsageGroup[] {
  const groups = new Map<string, { group: ClassifierUsageGroup; cost: bigint }>()
  for (const run of runs) {
    const key = JSON.stringify([
      run.classifier,
      run.primitive,
      run.provider,
      run.model,
      run.promptVersionId,
      run.scopeCategory,
    ])
    const entry = groups.get(key) ?? { group: emptyGroup(run), cost: 0n }
    groups.set(key, {
      group: addRun(entry.group, run),
      cost: entry.cost + BigInt(run.costMicrounits),
    })
  }
  return [...groups.values()]
    .map(({ group, cost }) => ({ ...group, costMicrounits: cost.toString() }))
    .toSorted(compareGroups)
}

function emptyGroup(run: ClassifierRunUsage): ClassifierUsageGroup {
  return {
    classifier: run.classifier,
    primitive: run.primitive,
    provider: run.provider,
    model: run.model,
    promptVersionId: run.promptVersionId,
    scopeCategory: run.scopeCategory,
    runs: 0,
    outcomes: {},
    attemptsStarted: 0,
    retries: 0,
    sweepEnqueues: 0,
    providerCalls: 0,
    attemptsWithoutRecordedResponse: 0,
    shards: 0,
    candidates: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    pricedCalls: 0,
    unpricedCalls: 0,
    costMicrounits: '0',
    latencyMsTotal: 0,
    latencyMsMax: null,
    latencySamples: 0,
    localDetectorCalls: 0,
    localCostMicrounits: '0',
  }
}

function addRun(group: ClassifierUsageGroup, run: ClassifierRunUsage): ClassifierUsageGroup {
  return {
    ...group,
    runs: group.runs + 1,
    outcomes: { ...group.outcomes, [run.outcome]: (group.outcomes[run.outcome] ?? 0) + 1 },
    attemptsStarted: group.attemptsStarted + run.attemptsStarted,
    retries: group.retries + run.retries,
    sweepEnqueues: group.sweepEnqueues + run.sweepEnqueues,
    providerCalls: group.providerCalls + run.providerCalls,
    attemptsWithoutRecordedResponse:
      group.attemptsWithoutRecordedResponse + run.attemptsWithoutRecordedResponse,
    shards: group.shards + run.shardCount,
    candidates: group.candidates + run.candidateCount,
    inputTokens: group.inputTokens + run.inputTokens,
    cachedInputTokens: group.cachedInputTokens + run.cachedInputTokens,
    outputTokens: group.outputTokens + run.outputTokens,
    pricedCalls: group.pricedCalls + run.pricedCalls,
    unpricedCalls: group.unpricedCalls + run.unpricedCalls,
    latencyMsTotal: group.latencyMsTotal + run.latencyMsTotal,
    latencyMsMax:
      run.latencyMsMax === null
        ? group.latencyMsMax
        : Math.max(group.latencyMsMax ?? 0, run.latencyMsMax),
    latencySamples: group.latencySamples + run.latencySamples,
    localDetectorCalls: group.localDetectorCalls + (run.localDetector !== null ? 1 : 0),
  }
}

function compareGroups(a: ClassifierUsageGroup, b: ClassifierUsageGroup): number {
  return (
    a.classifier.localeCompare(b.classifier) ||
    (a.model ?? '').localeCompare(b.model ?? '') ||
    (a.promptVersionId ?? '').localeCompare(b.promptVersionId ?? '') ||
    (a.scopeCategory ?? '').localeCompare(b.scopeCategory ?? '')
  )
}
