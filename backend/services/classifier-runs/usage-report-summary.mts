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
    let entry = groups.get(key)
    if (!entry) {
      entry = { group: emptyGroup(run), cost: 0n }
      groups.set(key, entry)
    }
    addRun(entry.group, run)
    entry.cost += BigInt(run.costMicrounits)
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

function addRun(group: ClassifierUsageGroup, run: ClassifierRunUsage): void {
  group.runs += 1
  group.outcomes[run.outcome] = (group.outcomes[run.outcome] ?? 0) + 1
  group.attemptsStarted += run.attemptsStarted
  group.retries += run.retries
  group.sweepEnqueues += run.sweepEnqueues
  group.providerCalls += run.providerCalls
  group.attemptsWithoutRecordedResponse += run.attemptsWithoutRecordedResponse
  group.shards += run.shardCount
  group.candidates += run.candidateCount
  group.inputTokens += run.inputTokens
  group.cachedInputTokens += run.cachedInputTokens
  group.outputTokens += run.outputTokens
  group.pricedCalls += run.pricedCalls
  group.unpricedCalls += run.unpricedCalls
  group.latencyMsTotal += run.latencyMsTotal
  group.latencySamples += run.latencySamples
  if (run.latencyMsMax !== null) {
    group.latencyMsMax = Math.max(group.latencyMsMax ?? 0, run.latencyMsMax)
  }
  if (run.localDetector !== null) group.localDetectorCalls += 1
}

function compareGroups(a: ClassifierUsageGroup, b: ClassifierUsageGroup): number {
  return (
    a.classifier.localeCompare(b.classifier) ||
    (a.model ?? '').localeCompare(b.model ?? '') ||
    (a.promptVersionId ?? '').localeCompare(b.promptVersionId ?? '') ||
    (a.scopeCategory ?? '').localeCompare(b.scopeCategory ?? '')
  )
}
