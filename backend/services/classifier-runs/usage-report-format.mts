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

/**
 * A breach is final whatever else is still running. Without one, the KPI only holds for good once
 * every run is settled: an unfinished run can still reserve an attempt and bill a second call.
 */
function verdict({
  maxProviderCallsPerRun,
  unfinishedRuns,
}: Pick<ClassifierEfficiency, 'maxProviderCallsPerRun' | 'unfinishedRuns'>): string {
  if (maxProviderCallsPerRun > 1) return 'BREACHED'
  if (unfinishedRuns === 0) return 'holds'
  return `INCONCLUSIVE (no breach so far, ${unfinishedRuns} unfinished runs can still call the provider)`
}

/** The ledger leaves a call it could not price out of the sum, so the total is then a floor. */
function cost({ costMicrounits, unpricedCalls }: ClassifierEfficiency): string {
  const total = dollars(costMicrounits)
  if (unpricedCalls === 0) return total
  return `at least ${total} (excludes ${unpricedCalls} unpriced billed calls)`
}

function describeClassifier(
  efficiency: ClassifierEfficiency,
  versions: readonly ClassifierContentVersionUsage[],
  requests: number,
): string[] {
  return [
    efficiency.classifier,
    `  KPI (at most one billed call per receipt): ${verdict(efficiency)}`,
    `  content versions ${efficiency.contentVersions}, runs ${efficiency.runs}, billed runs ${efficiency.billedRuns}`,
    `  billed provider calls ${efficiency.providerCalls}, most in one run ${efficiency.maxProviderCallsPerRun}, runs over one call ${efficiency.runsOverOneCall}`,
    `  calls per content version: ${callsPerContentVersion(versions)}`,
    `  re-classifications (configuration changed): ${efficiency.reclassifications}`,
    `  attempts ${efficiency.attemptsStarted}, retries ${efficiency.retries}, attempts without a recorded response ${efficiency.attemptsWithoutRecordedResponse}`,
    `  cost ${cost(efficiency)}, latency ${latency(efficiency)}`,
    `  local detector runs (never billed): ${efficiency.localDetectorRuns}`,
    `  diagnostic only: ${requests} requested content versions, ${efficiency.sweepEnqueues} sweep re-enqueues of unfinished runs`,
  ]
}

/**
 * A classifier that reserved no run in the window. With requests, its subjects asked and the sweep
 * is behind; with none, its producer was silent, which the other blocks must not hide.
 */
function describeIdleClassifier(classifier: string, requests: number): string[] {
  if (requests === 0) return [classifier, '  no requests and no runs in the window']
  return [
    classifier,
    '  no run was reserved in the window',
    `  diagnostic only: ${requests} requested content versions`,
  ]
}

/**
 * @public Cross-workspace read boundary: `backend/scripts/classifier-call-efficiency.mts` prints it.
 *
 * The report as text, one block per classifier, active catalog included: the D3 KPI verdict first
 * (holds, BREACHED, or INCONCLUSIVE while a run is unfinished), then the figures that back it.
 * A replay bills nothing and writes nothing, and neither diagnostic figure counts it
 * (`requested content versions` are request rows created in the window, which a retrigger of
 * unchanged content reuses), so the zero-bill evidence is `runsOverOneCall` staying at zero.
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
  const withRuns = new Set(report.efficiency.map(({ classifier }) => classifier))
  const seen = new Set([...report.classifiers, ...Object.keys(report.requests)])
  for (const classifier of [...seen].toSorted((a, b) => a.localeCompare(b))) {
    if (!withRuns.has(classifier)) {
      lines.push('', ...describeIdleClassifier(classifier, report.requests[classifier] ?? 0))
    }
  }
  return `${lines.join('\n')}\n`
}
