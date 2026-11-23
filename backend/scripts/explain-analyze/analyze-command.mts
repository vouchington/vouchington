import {
  assertNoPressureRegressions,
  type ExplainResult,
  formatMarkdownReport,
  type PressureBaseline,
} from '@vouchington/explain-plan'
import { assertNoGenericPlanRegressions } from './generic-plan-regressions.mts'
import { PLAN_ANALYSIS_OPTIONS } from './plan-analysis-options.mts'
import { RESOURCE_PRESSURE_BASELINE } from './resource-pressure-baseline.mts'
import { assertNoNewSeqScans, getSeqScanNearTies } from './seq-scan-baseline.mts'

function getUserLabel(name: string): 'baseline' | 'heavy' {
  return name.split(':').some(segment => segment === 'heavy' || segment.startsWith('heavy-'))
    ? 'heavy'
    : 'baseline'
}

function getDisplayName(name: string): string {
  return name.replace(/:heavy(?=:|$)/, '')
}

export function analyzePairedResults(
  filePath: string,
  results: readonly ExplainResult[],
  repeatedResults: readonly ExplainResult[],
  baseline: PressureBaseline = RESOURCE_PRESSURE_BASELINE,
): void {
  console.error(`Reading: ${filePath}`)
  if (results.length === 0 || repeatedResults.length === 0)
    throw new Error('Latest EXPLAIN output contains no query results')
  const unstable = assertNoNewSeqScans(results, repeatedResults)
  if (unstable.onlyFirst.length > 0 || unstable.onlyRepeated.length > 0)
    console.error(`Unstable sequential scans (advisory): ${JSON.stringify(unstable)}`)
  const nearTies = getSeqScanNearTies(results, repeatedResults)
  if (nearTies.length > 0)
    console.error(
      `Sequential scans within a near-tie of an index plan (advisory): ${nearTies.join(',')}`,
    )
  assertNoPressureRegressions(results, repeatedResults, baseline)
  assertNoGenericPlanRegressions(results, repeatedResults)
  console.error(`Loaded ${results.length} query results`)

  console.log(
    formatMarkdownReport(results, {
      ...PLAN_ANALYSIS_OPTIONS,
      source: filePath,
      displayName: getDisplayName,
      columns: [{ header: 'User', value: result => getUserLabel(result.name) }],
    }),
  )
}
