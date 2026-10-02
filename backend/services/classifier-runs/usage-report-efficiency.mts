import type {
  ClassifierContentVersionUsage,
  ClassifierEfficiency,
  ClassifierRunUsage,
} from './usage-report-types.mts'

type VersionEntry = { version: ClassifierContentVersionUsage; cost: bigint }

/**
 * Sums runs by content version: a classifier's runs for one subject at one input digest and
 * community publication, whatever their configurations. Pure: every figure is read from the runs
 * it is given, so a run that billed nothing (a local-only run, a replay, a retry whose attempt the
 * provider refused) adds no call to the version it belongs to.
 */
export function summarizeClassifierContentVersions(
  runs: readonly ClassifierRunUsage[],
): ClassifierContentVersionUsage[] {
  const versions = new Map<string, VersionEntry>()
  for (const run of runs) {
    const key = JSON.stringify([
      run.classifier,
      run.subjectKind,
      run.subjectId,
      run.inputSha256,
      run.communityIdentityId,
    ])
    let entry = versions.get(key)
    if (!entry) {
      entry = { version: emptyVersion(run), cost: 0n }
      versions.set(key, entry)
    }
    addRun(entry, run)
  }
  return [...versions.values()]
    .map(({ version, cost }) => ({
      ...version,
      reclassifications: Math.max(version.billedRuns - 1, 0),
      costMicrounits: cost.toString(),
    }))
    .toSorted(compareVersions)
}

/**
 * One classifier's content versions summed. The D3 KPI is per receipt (one content version under
 * one configuration): it holds when `maxProviderCallsPerRun` is at most one. `reclassifications`
 * counts configuration changes that re-billed the same content; it is read alongside the KPI and is
 * never a breach by itself, because each of those receipts was still allowed one call.
 */
export function summarizeClassifierEfficiency(
  versions: readonly ClassifierContentVersionUsage[],
): ClassifierEfficiency[] {
  const byClassifier = new Map<string, { efficiency: ClassifierEfficiency; cost: bigint }>()
  for (const version of versions) {
    let entry = byClassifier.get(version.classifier)
    if (!entry) {
      entry = { efficiency: emptyEfficiency(version.classifier), cost: 0n }
      byClassifier.set(version.classifier, entry)
    }
    addVersion(entry.efficiency, version)
    entry.cost += BigInt(version.costMicrounits)
  }
  return [...byClassifier.values()]
    .map(({ efficiency, cost }) => ({ ...efficiency, costMicrounits: cost.toString() }))
    .toSorted((a, b) => a.classifier.localeCompare(b.classifier))
}

function emptyVersion(run: ClassifierRunUsage): ClassifierContentVersionUsage {
  return {
    classifier: run.classifier,
    subjectKind: run.subjectKind,
    subjectId: run.subjectId,
    inputSha256: run.inputSha256,
    communityIdentityId: run.communityIdentityId,
    runs: 0,
    billedRuns: 0,
    reclassifications: 0,
    attemptsStarted: 0,
    retries: 0,
    sweepEnqueues: 0,
    providerCalls: 0,
    maxProviderCallsPerRun: 0,
    runsOverOneCall: 0,
    attemptsWithoutRecordedResponse: 0,
    persistedDecisionCalls: 0,
    costMicrounits: '0',
    latencyMsTotal: 0,
    latencySamples: 0,
    localDetectorRuns: 0,
  }
}

function addRun(entry: VersionEntry, run: ClassifierRunUsage): void {
  const { version } = entry
  version.runs += 1
  if (run.providerCalls > 0) version.billedRuns += 1
  version.attemptsStarted += run.attemptsStarted
  version.retries += run.retries
  version.sweepEnqueues += run.sweepEnqueues
  version.providerCalls += run.providerCalls
  version.maxProviderCallsPerRun = Math.max(version.maxProviderCallsPerRun, run.providerCalls)
  if (run.providerCalls > 1) version.runsOverOneCall += 1
  version.attemptsWithoutRecordedResponse += run.attemptsWithoutRecordedResponse
  version.persistedDecisionCalls += run.shardCount
  version.latencyMsTotal += run.latencyMsTotal
  version.latencySamples += run.latencySamples
  if (run.localDetector !== null) version.localDetectorRuns += 1
  entry.cost += BigInt(run.costMicrounits)
}

function emptyEfficiency(classifier: string): ClassifierEfficiency {
  return {
    classifier,
    contentVersions: 0,
    runs: 0,
    providerCalls: 0,
    billedRuns: 0,
    maxProviderCallsPerRun: 0,
    runsOverOneCall: 0,
    reclassifications: 0,
    attemptsStarted: 0,
    retries: 0,
    sweepEnqueues: 0,
    attemptsWithoutRecordedResponse: 0,
    costMicrounits: '0',
    latencyMsTotal: 0,
    latencySamples: 0,
    localDetectorRuns: 0,
  }
}

function addVersion(
  efficiency: ClassifierEfficiency,
  version: ClassifierContentVersionUsage,
): void {
  efficiency.contentVersions += 1
  efficiency.runs += version.runs
  efficiency.providerCalls += version.providerCalls
  efficiency.billedRuns += version.billedRuns
  efficiency.maxProviderCallsPerRun = Math.max(
    efficiency.maxProviderCallsPerRun,
    version.maxProviderCallsPerRun,
  )
  efficiency.runsOverOneCall += version.runsOverOneCall
  efficiency.reclassifications += version.reclassifications
  efficiency.attemptsStarted += version.attemptsStarted
  efficiency.retries += version.retries
  efficiency.sweepEnqueues += version.sweepEnqueues
  efficiency.attemptsWithoutRecordedResponse += version.attemptsWithoutRecordedResponse
  efficiency.latencyMsTotal += version.latencyMsTotal
  efficiency.latencySamples += version.latencySamples
  efficiency.localDetectorRuns += version.localDetectorRuns
}

function compareVersions(
  a: ClassifierContentVersionUsage,
  b: ClassifierContentVersionUsage,
): number {
  return (
    a.classifier.localeCompare(b.classifier) ||
    a.subjectKind.localeCompare(b.subjectKind) ||
    a.subjectId.localeCompare(b.subjectId) ||
    a.inputSha256.localeCompare(b.inputSha256) ||
    (a.communityIdentityId ?? '').localeCompare(b.communityIdentityId ?? '')
  )
}
