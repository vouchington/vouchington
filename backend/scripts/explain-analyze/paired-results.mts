import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ExplainResult } from '@data-stores/psql'

export function loadLatestPairedResults(outputDir: string): {
  filePath: string
  results: ExplainResult[]
  repeatedResults: ExplainResult[]
} {
  let files: string[]
  try {
    files = readdirSync(outputDir)
      .filter(file => file.startsWith('results-') && file.endsWith('.json'))
      .toSorted()
      .toReversed()
  } catch {
    throw new Error(`No output directory found at ${outputDir}. Run explain:run first.`)
  }
  const latest = files[0]
  if (!latest) throw new Error('No result files found. Run explain:run first.')
  const filePath = join(outputDir, latest)
  const repeatedPath = join(outputDir, latest.replace(/^results-/, 'repeat-'))
  const first = JSON.parse(readFileSync(filePath, 'utf8')) as {
    results: ExplainResult[]
    completedScenarioIds: string[]
  }
  let repeated: typeof first
  try {
    repeated = JSON.parse(readFileSync(repeatedPath, 'utf8')) as typeof first
  } catch {
    throw new Error(`Missing repeated EXPLAIN capture at ${repeatedPath}`)
  }
  if (JSON.stringify(first.completedScenarioIds) !== JSON.stringify(repeated.completedScenarioIds))
    throw new Error('Repeated EXPLAIN capture changed its scenario manifest')
  return { filePath, results: first.results, repeatedResults: repeated.results }
}
