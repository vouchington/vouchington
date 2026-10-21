import type { ExplainResult } from '@data-stores/psql'
import { getLargeTableSeqScanRelations } from './plan-warnings.mts'
import { BASELINE_FINGERPRINTS } from './seq-scan-baseline-data.mts'
import {
  isSeqScanNearTie,
  isStaleSeqScanNearTie,
  type ProbedExplainResult,
} from './seq-scan-ties.mts'

export type SeqScanBaseline = Readonly<Record<string, readonly string[]>>

// The starting fingerprints and their CI provenance live in seq-scan-baseline-data.mts.
// Remove an entry when its scan is fixed.
const baselineByIdentity = new Map<string, string[]>()
for (const fingerprint of BASELINE_FINGERPRINTS) {
  const separator = fingerprint.lastIndexOf(':')
  const identity = fingerprint.slice(0, separator)
  const relation = fingerprint.slice(separator + 1)
  const relations = baselineByIdentity.get(identity) ?? []
  relations.push(relation)
  baselineByIdentity.set(identity, relations)
}
export const SEQ_SCAN_BASELINE: SeqScanBaseline = Object.fromEntries(baselineByIdentity)

export function getExplainResultIdentity(result: ExplainResult): string {
  return [
    result.scenario_id ?? 'unscoped',
    result.capture_index ?? 0,
    result.name,
    result.plan_cache_mode ?? 'auto',
  ].join('|')
}

// The scan gate fails a fingerprint seen in both passes, or a baselined one absent from both, so
// the repeated pass re-samples the relations the first pass scanned and the baselined relations it
// skipped. Re-analyzing every other large relation a plan touched took most of the run (#3402).
export function getResampleRelations(
  results: readonly ExplainResult[],
  baseline: SeqScanBaseline = SEQ_SCAN_BASELINE,
): string[] {
  return [
    ...new Set(
      results.flatMap(result => [
        ...getLargeTableSeqScanRelations(result),
        ...(baseline[getExplainResultIdentity(result)] ?? []),
      ]),
    ),
  ].toSorted()
}

export function assertNoNewSeqScans(
  firstResults: readonly ExplainResult[],
  repeatedResults: readonly ExplainResult[],
  baseline: SeqScanBaseline = SEQ_SCAN_BASELINE,
): { onlyFirst: string[]; onlyRepeated: string[] } {
  const captureIdentity = (result: ExplainResult) =>
    JSON.stringify([getExplainResultIdentity(result), result.query_text])
  const firstIdentities = firstResults.map(captureIdentity).toSorted()
  const repeatedIdentities = repeatedResults.map(captureIdentity).toSorted()
  if (JSON.stringify(firstIdentities) !== JSON.stringify(repeatedIdentities))
    throw new Error('Repeated EXPLAIN capture changed its query identities')

  const first = scanFingerprints(firstResults)
  const repeated = scanFingerprints(repeatedResults)
  const onlyFirst = [...first].filter(fingerprint => !repeated.has(fingerprint)).toSorted()
  const onlyRepeated = [...repeated].filter(fingerprint => !first.has(fingerprint)).toSorted()
  const compareModes = new Set(['force_custom_plan', 'force_generic_plan'])
  const capturedModes = new Set<string>(
    firstResults.map(result => result.plan_cache_mode ?? 'auto'),
  )
  const gatedFirst = scanFingerprints(
    firstResults.filter(result => compareModes.has(result.plan_cache_mode ?? 'auto')),
  )
  const gatedRepeated = scanFingerprints(
    repeatedResults.filter(result => compareModes.has(result.plan_cache_mode ?? 'auto')),
  )
  const stable = new Set([...gatedFirst].filter(fingerprint => gatedRepeated.has(fingerprint)))
  const isCapturedCompareIdentity = (identity: string) => {
    const mode = identity.slice(identity.lastIndexOf('|') + 1)
    return compareModes.has(mode) && capturedModes.has(mode)
  }
  const allowed = new Set(
    Object.entries(baseline)
      .filter(([identity]) => isCapturedCompareIdentity(identity))
      .flatMap(([identity, relations]) => relations.map(relation => `${identity}:${relation}`)),
  )
  // A scan whose statement priced within SEQ_SCAN_TIE_RATIO of its no-seq-scan plan is a coin
  // flip across databases, not a missing index; it is advisory until a clear margin appears.
  const nearTies = getSeqScanNearTies(firstResults, repeatedResults)
  const added = [...stable]
    .filter(fingerprint => !allowed.has(fingerprint) && !nearTies.includes(fingerprint))
    .toSorted()
  // The mirror case: a baselined scan the planner dropped is not fixed when forcing it back
  // would have cost almost the same, so it is advisory too.
  const staleNearTies = getStaleNearTies(firstResults, repeatedResults)
  const stale = [
    ...[...allowed].filter(
      fingerprint =>
        !gatedFirst.has(fingerprint) &&
        !gatedRepeated.has(fingerprint) &&
        !staleNearTies.includes(fingerprint),
    ),
    ...Object.entries(baseline)
      .filter(
        ([identity, relations]) => isCapturedCompareIdentity(identity) && relations.length === 0,
      )
      .map(([identity]) => identity),
  ].toSorted()
  if (added.length > 0 || stale.length > 0)
    throw new Error(
      `Large-table sequential scan baseline changed: new [${added.join(', ')}]; stale [${stale.join(', ')}]`,
    )
  return { onlyFirst, onlyRepeated }
}

export function getSeqScanNearTies(
  firstResults: readonly ExplainResult[],
  repeatedResults: readonly ExplainResult[],
): string[] {
  const tied = [...firstResults, ...repeatedResults].filter(isSeqScanNearTie)
  return [
    ...new Set([...scanFingerprints(tied), ...getStaleNearTies(firstResults, repeatedResults)]),
  ].toSorted()
}

function getStaleNearTies(
  firstResults: readonly ExplainResult[],
  repeatedResults: readonly ExplainResult[],
): string[] {
  return [...firstResults, ...repeatedResults].flatMap(result =>
    Object.keys((result as ProbedExplainResult).forced_seq_scans ?? {})
      .filter(relation => isStaleSeqScanNearTie(result as ProbedExplainResult, relation))
      .map(relation => `${getExplainResultIdentity(result)}:${relation}`),
  )
}

function scanFingerprints(results: readonly ExplainResult[]): Set<string> {
  const observed = new Set<string>()
  for (const result of results) {
    const identity = getExplainResultIdentity(result)
    for (const relation of getLargeTableSeqScanRelations(result))
      observed.add(`${identity}:${relation}`)
  }
  return observed
}
