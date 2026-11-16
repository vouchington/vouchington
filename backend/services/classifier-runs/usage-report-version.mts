import { addAgentRun, NO_AGENT_TURNS } from './usage-report-agent-turns.mts'
import type { ClassifierContentVersionUsage, ClassifierRunUsage } from './usage-report-types.mts'

export type VersionEntry = { version: ClassifierContentVersionUsage; cost: bigint }

export function emptyVersion(run: ClassifierRunUsage): ClassifierContentVersionUsage {
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
    unfinishedRuns: 0,
    unpricedCalls: 0,
    costMicrounits: '0',
    latencyMsTotal: 0,
    latencySamples: 0,
    localDetectorRuns: 0,
    ...NO_AGENT_TURNS,
  }
}

/**
 * A run can still reserve a provider attempt while it has a remote batch, is neither completed nor
 * failed, and its outcomes are not durable: a claim then replays instead of calling. The batch is
 * fixed when the receipt is reserved, so a local-only run (no batch) never reaches the provider. A
 * superseded run counts, since the same update that leases it revives it once its content and
 * configuration are current again. An agent run reserves no batch, so it counts by its primitive.
 */
function canStillCallProvider(run: ClassifierRunUsage): boolean {
  if (run.batchId === null && run.primitive !== 'agent') return false
  return (run.outcome === 'incomplete' || run.outcome === 'superseded') && !run.outcomesPersisted
}

export function addRun(entry: VersionEntry, run: ClassifierRunUsage): VersionEntry {
  const { version } = entry
  const callFigures =
    run.primitive === 'agent'
      ? addAgentRun(version, run)
      : {
          maxProviderCallsPerRun: Math.max(version.maxProviderCallsPerRun, run.providerCalls),
          runsOverOneCall: version.runsOverOneCall + (run.providerCalls > 1 ? 1 : 0),
        }
  return {
    version: {
      ...version,
      runs: version.runs + 1,
      billedRuns: version.billedRuns + (run.providerCalls > 0 ? 1 : 0),
      attemptsStarted: version.attemptsStarted + run.attemptsStarted,
      retries: version.retries + run.retries,
      sweepEnqueues: version.sweepEnqueues + run.sweepEnqueues,
      providerCalls: version.providerCalls + run.providerCalls,
      ...callFigures,
      attemptsWithoutRecordedResponse:
        version.attemptsWithoutRecordedResponse + run.attemptsWithoutRecordedResponse,
      persistedDecisionCalls: version.persistedDecisionCalls + run.shardCount,
      unfinishedRuns: version.unfinishedRuns + (canStillCallProvider(run) ? 1 : 0),
      unpricedCalls: version.unpricedCalls + run.unpricedCalls,
      latencyMsTotal: version.latencyMsTotal + run.latencyMsTotal,
      latencySamples: version.latencySamples + run.latencySamples,
      localDetectorRuns: version.localDetectorRuns + (run.localDetector !== null ? 1 : 0),
    },
    cost: entry.cost + BigInt(run.costMicrounits),
  }
}
