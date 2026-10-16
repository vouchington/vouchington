import type { ExplainResult } from '@data-stores/psql'
import { getLargeTableSeqScanRelations } from './plan-warnings.mts'
import { BASELINE_FINGERPRINTS } from './seq-scan-baseline-data.mts'

export type SeqScanBaseline = Readonly<Record<string, readonly string[]>>

// Starting baseline from CI run 38557423714 (2026-10-14T11-42-47-022Z), first/repeat captures.
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
  const stable = new Set([...first].filter(fingerprint => repeated.has(fingerprint)))
  const onlyFirst = [...first].filter(fingerprint => !repeated.has(fingerprint)).toSorted()
  const onlyRepeated = [...repeated].filter(fingerprint => !first.has(fingerprint)).toSorted()
  const allowed = new Set(
    Object.entries(baseline).flatMap(([identity, relations]) =>
      relations.map(relation => `${identity}:${relation}`),
    ),
  )
  const added = [...stable].filter(fingerprint => !allowed.has(fingerprint)).toSorted()
  const stale = [
    ...[...allowed].filter(fingerprint => !first.has(fingerprint) && !repeated.has(fingerprint)),
    ...Object.entries(baseline)
      .filter(([, relations]) => relations.length === 0)
      .map(([identity]) => identity),
  ].toSorted()
  if (added.length > 0 || stale.length > 0)
    throw new Error(
      `Large-table sequential scan baseline changed: new [${added.join(', ')}]; stale [${stale.join(', ')}]`,
    )
  return { onlyFirst, onlyRepeated }
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
