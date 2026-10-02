import type {
  ClassifierContentVersionUsage,
  ClassifierEfficiency,
  ClassifierUsageReport,
} from './usage-report-types.mts'

const MICROUNITS_PER_DOLLAR = 1_000_000n
/** How many content versions a section lists before it summarizes the rest. */
const LISTED_VERSIONS = 10

function dollars(microunits: string): string {
  const total = BigInt(microunits)
  const whole = total / MICROUNITS_PER_DOLLAR
  const fraction = (total % MICROUNITS_PER_DOLLAR).toString().padStart(6, '0')
  return `$${whole}.${fraction}`
}

function latency({ latencyMsTotal, latencySamples }: ClassifierEfficiency): string {
  if (latencySamples === 0) return 'no samples'
  return `${Math.round(latencyMsTotal / latencySamples)} ms mean over ${latencySamples} calls`
}

/** The content versions of one classifier by how many billed calls each took in all its runs. */
function callsPerContentVersion(versions: readonly ClassifierContentVersionUsage[]): string {
  const counts = { none: 0, one: 0, more: 0 }
  for (const { providerCalls } of versions) {
    if (providerCalls === 0) counts.none += 1
    else if (providerCalls === 1) counts.one += 1
    else counts.more += 1
  }
  return `0 calls: ${counts.none}, 1 call: ${counts.one}, 2+ calls: ${counts.more}`
}

function describeVersion(version: ClassifierContentVersionUsage): string {
  const { subjectKind, subjectId, inputSha256, runs, providerCalls, maxProviderCallsPerRun } =
    version
  return (
    `  ${subjectKind} ${subjectId} input ${inputSha256.slice(0, 12)}: ${runs} runs, ` +
    `${providerCalls} calls, at most ${maxProviderCallsPerRun} in one run`
  )
}

function listVersions(versions: readonly ClassifierContentVersionUsage[]): string[] {
  const lines = versions.slice(0, LISTED_VERSIONS).map(describeVersion)
  if (versions.length > LISTED_VERSIONS) {
    lines.push(`  ... and ${versions.length - LISTED_VERSIONS} more`)
  }
  return lines
}

function describeClassifier(
  efficiency: ClassifierEfficiency,
  versions: readonly ClassifierContentVersionUsage[],
  requests: number,
): string[] {
  const holds = efficiency.maxProviderCallsPerRun <= 1
  return [
    efficiency.classifier,
    `  KPI (at most one billed call per receipt): ${holds ? 'holds' : 'BREACHED'}`,
    `  content versions ${efficiency.contentVersions}, runs ${efficiency.runs}, billed runs ${efficiency.billedRuns}`,
    `  billed provider calls ${efficiency.providerCalls}, most in one run ${efficiency.maxProviderCallsPerRun}, runs over one call ${efficiency.runsOverOneCall}`,
    `  calls per content version: ${callsPerContentVersion(versions)}`,
    `  re-classifications (configuration changed): ${efficiency.reclassifications}`,
    `  attempts ${efficiency.attemptsStarted}, retries ${efficiency.retries}, attempts without a recorded response ${efficiency.attemptsWithoutRecordedResponse}`,
    `  cost ${dollars(efficiency.costMicrounits)}, latency ${latency(efficiency)}`,
    `  local detector runs (never billed): ${efficiency.localDetectorRuns}`,
    `  diagnostic only: ${requests} durable requests, ${efficiency.sweepEnqueues} sweep enqueues`,
  ]
}

/**
 * @public Cross-workspace read boundary: `backend/scripts/classifier-call-efficiency.mts` prints it.
 *
 * The report as text, one block per classifier: the D3 KPI verdict first, then the figures that
 * back it. Replays leave no counter of their own (a replay bills nothing and writes nothing), so
 * the zero-bill evidence is `runsOverOneCall` staying at zero while requests and sweeps repeat.
 */
export function formatClassifierUsageReport(report: ClassifierUsageReport): string {
  const lines = [
    `Classifier call efficiency: runs reserved ${report.window.from.toISOString()} to ${report.window.to.toISOString()}`,
  ]
  if (report.efficiency.length === 0) lines.push('', 'No classifier runs were reserved.')
  for (const efficiency of report.efficiency) {
    const versions = report.contentVersions.filter(v => v.classifier === efficiency.classifier)
    lines.push(
      '',
      ...describeClassifier(efficiency, versions, report.requests[efficiency.classifier] ?? 0),
    )
    const breaches = versions.filter(version => version.runsOverOneCall > 0)
    if (breaches.length > 0) lines.push('  receipts over one call:', ...listVersions(breaches))
    const reclassified = versions.filter(version => version.reclassifications > 0)
    if (reclassified.length > 0)
      lines.push('  re-classified content:', ...listVersions(reclassified))
  }
  return `${lines.join('\n')}\n`
}
