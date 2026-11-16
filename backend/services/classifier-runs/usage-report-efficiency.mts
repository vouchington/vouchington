import { addAgentTurns, NO_AGENT_TURNS } from './usage-report-agent-turns.mts'
import type {
  ClassifierContentVersionUsage,
  ClassifierEfficiency,
  ClassifierRunUsage,
} from './usage-report-types.mts'
import { addRun, emptyVersion, type VersionEntry } from './usage-report-version.mts'

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
    versions.set(key, addRun(versions.get(key) ?? { version: emptyVersion(run), cost: 0n }, run))
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
 * one configuration): it holds when `maxProviderCallsPerRun` is at most one, and that is final only
 * once `unfinishedRuns` is zero, because such a run can still call the provider. `reclassifications`
 * counts configuration changes that re-billed the same content; it is read alongside the KPI and is
 * never a breach by itself, because each of those receipts was still allowed one call.
 */
export function summarizeClassifierEfficiency(
  versions: readonly ClassifierContentVersionUsage[],
): ClassifierEfficiency[] {
  const byClassifier = new Map<string, { efficiency: ClassifierEfficiency; cost: bigint }>()
  for (const version of versions) {
    const entry = byClassifier.get(version.classifier) ?? {
      efficiency: emptyEfficiency(version.classifier),
      cost: 0n,
    }
    byClassifier.set(version.classifier, {
      efficiency: addVersion(entry.efficiency, version),
      cost: entry.cost + BigInt(version.costMicrounits),
    })
  }
  return [...byClassifier.values()]
    .map(({ efficiency, cost }) => ({ ...efficiency, costMicrounits: cost.toString() }))
    .toSorted((a, b) => a.classifier.localeCompare(b.classifier))
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
    unfinishedRuns: 0,
    unpricedCalls: 0,
    costMicrounits: '0',
    latencyMsTotal: 0,
    latencySamples: 0,
    localDetectorRuns: 0,
    ...NO_AGENT_TURNS,
  }
}

function addVersion(
  efficiency: ClassifierEfficiency,
  version: ClassifierContentVersionUsage,
): ClassifierEfficiency {
  return {
    ...efficiency,
    contentVersions: efficiency.contentVersions + 1,
    runs: efficiency.runs + version.runs,
    providerCalls: efficiency.providerCalls + version.providerCalls,
    billedRuns: efficiency.billedRuns + version.billedRuns,
    maxProviderCallsPerRun: Math.max(
      efficiency.maxProviderCallsPerRun,
      version.maxProviderCallsPerRun,
    ),
    runsOverOneCall: efficiency.runsOverOneCall + version.runsOverOneCall,
    reclassifications: efficiency.reclassifications + version.reclassifications,
    attemptsStarted: efficiency.attemptsStarted + version.attemptsStarted,
    retries: efficiency.retries + version.retries,
    sweepEnqueues: efficiency.sweepEnqueues + version.sweepEnqueues,
    attemptsWithoutRecordedResponse:
      efficiency.attemptsWithoutRecordedResponse + version.attemptsWithoutRecordedResponse,
    unfinishedRuns: efficiency.unfinishedRuns + version.unfinishedRuns,
    unpricedCalls: efficiency.unpricedCalls + version.unpricedCalls,
    latencyMsTotal: efficiency.latencyMsTotal + version.latencyMsTotal,
    latencySamples: efficiency.latencySamples + version.latencySamples,
    localDetectorRuns: efficiency.localDetectorRuns + version.localDetectorRuns,
    ...addAgentTurns(efficiency, version),
  }
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
