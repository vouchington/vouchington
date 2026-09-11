import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ExplainResult } from '@data-stores/psql'
import { analyzeResult, getResourcePressureFingerprints } from './plan-warnings.mts'
import {
  RESOURCE_PRESSURE_BASELINE,
  type ResourcePressureBaseline,
} from './resource-pressure-baseline.mts'

const OUTPUT_DIR = join(import.meta.dirname, 'output')

export function getUserLabel(name: string): 'baseline' | 'heavy' {
  return name.split(':').some(segment => segment === 'heavy' || segment.startsWith('heavy-'))
    ? 'heavy'
    : 'baseline'
}

export function getDisplayName(name: string): string {
  return name.replace(/:heavy(?=:|$)/, '')
}

export function assertResultsPresent(results: readonly ExplainResult[]): void {
  if (results.length === 0) {
    throw new Error('Latest EXPLAIN output contains no query results')
  }
}

export function getExplainResultIdentity(result: ExplainResult): string {
  return [
    result.scenario_id ?? 'unscoped',
    result.capture_index ?? 0,
    result.name,
    result.plan_cache_mode ?? 'auto',
  ].join('|')
}

export function assertNoDisallowedRegressions(
  results: readonly ExplainResult[],
  baseline: ResourcePressureBaseline = RESOURCE_PRESSURE_BASELINE,
): void {
  const regressions = results.flatMap(result => {
    const identity = getExplainResultIdentity(result)
    const allowed = new Set(baseline[identity] ?? [])
    return getResourcePressureFingerprints(result)
      .filter(fingerprint => !allowed.has(fingerprint))
      .map(fingerprint => `${identity}=${fingerprint}`)
  })
  if (regressions.length > 0) {
    throw new Error(
      `EXPLAIN found new disallowed temp, spill, hash-batch, or WAL pressure: ${regressions.join(', ')}`,
    )
  }
}

function main() {
  let files: string[]
  try {
    files = readdirSync(OUTPUT_DIR)
      .filter(f => f.startsWith('results-') && f.endsWith('.json'))
      .toSorted()
      .toReversed()
  } catch {
    console.error(`No output directory found at ${OUTPUT_DIR}. Run explain:run first.`)
    process.exit(1)
  }

  if (files.length === 0) {
    console.error('No result files found. Run explain:run first.')
    process.exit(1)
  }

  const latest = files[0]
  const filePath = join(OUTPUT_DIR, latest)
  console.error(`Reading: ${filePath}`)

  const results = JSON.parse(readFileSync(filePath, 'utf8')) as ExplainResult[]
  assertResultsPresent(results)
  assertNoDisallowedRegressions(results)
  console.error(`Loaded ${results.length} query results`)

  const sorted = results.toSorted((a, b) => b.execution_time_ms - a.execution_time_ms)

  // Print markdown summary table
  console.log('## EXPLAIN ANALYZE Results\n')
  console.log('| Query | User | Exec (ms) | Plan (ms) | Warnings |')
  console.log('|-------|------|----------:|----------:|----------|')

  for (const r of sorted) {
    const displayName = getDisplayName(r.name)
    const user = getUserLabel(r.name)
    const warnings = analyzeResult(r)
    const warningParts: string[] = []
    if (warnings.seqScans.length > 0) {
      warningParts.push(`Seq scan: ${warnings.seqScans.map(s => s.relationName).join(', ')}`)
    }
    if (warnings.estimateMismatches.length > 0) {
      const worst = warnings.estimateMismatches[0]
      warningParts.push(`Est. mismatch ${worst.ratio.toFixed(0)}x on ${worst.relationName}`)
    }
    if (warnings.appendOverhead.length > 0) {
      warningParts.push(
        `Append overhead: ${warnings.appendOverhead.map(a => `${a.childCount} children`).join(', ')}`,
      )
    }
    if (warnings.highPlanningRatio) {
      warningParts.push(
        `High plan ratio: ${r.planning_time_ms.toFixed(1)}ms/${r.execution_time_ms.toFixed(1)}ms`,
      )
    }
    if (warnings.highSharedBuffers.length > 0) {
      const worst = warnings.highSharedBuffers[0]
      warningParts.push(
        `High buffers: ${worst.sharedBlocks} shared on ${worst.relationName ?? worst.nodeType}`,
      )
    }
    const warningStr = warningParts.join('; ') || '-'
    console.log(
      `| ${displayName} | ${user} | ${r.execution_time_ms.toFixed(1)} | ${r.planning_time_ms.toFixed(1)} | ${warningStr} |`,
    )
  }

  // Print detailed warnings section
  const queriesWithWarnings = sorted.filter(r => {
    const w = analyzeResult(r)
    return (
      w.seqScans.length > 0 ||
      w.estimateMismatches.length > 0 ||
      w.appendOverhead.length > 0 ||
      w.highPlanningRatio ||
      w.highSharedBuffers.length > 0
    )
  })

  if (queriesWithWarnings.length > 0) {
    console.log('\n### Warnings\n')
    for (const r of queriesWithWarnings) {
      const warnings = analyzeResult(r)
      console.log(
        `**${r.name}** (exec ${r.execution_time_ms.toFixed(1)}ms, plan ${r.planning_time_ms.toFixed(1)}ms)\n`,
      )

      if (warnings.seqScans.length > 0) {
        for (const s of warnings.seqScans) {
          console.log(
            `- Seq scan on \`${s.relationName}\` (${s.scannedRows} rows scanned, ${s.actualRows} rows output)`,
          )
        }
      }
      if (warnings.estimateMismatches.length > 0) {
        for (const e of warnings.estimateMismatches) {
          console.log(
            `- Row estimate mismatch: ${e.nodeType} on \`${e.relationName}\` — estimated ${e.planRows}, actual ${e.actualRows} (${e.ratio.toFixed(0)}x)`,
          )
        }
      }
      if (warnings.appendOverhead.length > 0) {
        for (const a of warnings.appendOverhead) {
          console.log(`- Append node overhead: ${a.childCount} children (${a.nodeType})`)
        }
      }
      if (warnings.highPlanningRatio) {
        console.log(
          `- High planning:execution ratio: ${r.planning_time_ms.toFixed(1)}ms planning vs ${r.execution_time_ms.toFixed(1)}ms execution`,
        )
      }
      if (warnings.highSharedBuffers.length > 0) {
        for (const b of warnings.highSharedBuffers) {
          console.log(
            `- High shared buffers: ${b.nodeType} on \`${b.relationName ?? 'unknown'}\` touched ${b.sharedBlocks} shared blocks (${b.sharedHitBlocks} hit, ${b.sharedReadBlocks} read, ${b.sharedDirtiedBlocks} dirtied, ${b.sharedWrittenBlocks} written)`,
          )
        }
      }
      console.log('')
    }
  }

  console.log(`\n*${results.length} queries analyzed from ${latest}*`)

  process.exit(0)
}

if (import.meta.main) {
  main()
}
