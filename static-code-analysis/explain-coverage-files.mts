import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

export type Source = { fileName: string; source: string }
export type CapturedResult = { name: string; query_text: string; scenario_id: string }

const REPO_ROOT = resolve(import.meta.dirname, '..')
const OUTPUT_DIR = join(REPO_ROOT, 'backend/scripts/explain-analyze/output')
const RUNTIME_ROOTS = [
  'backend/services',
  'backend/modules',
  'backend/workers',
  'backend/data-stores',
]

export function trackedRuntimeSources(): Source[] {
  const files = execFileSync('git', ['ls-files', '-z', '--', ...RUNTIME_ROOTS], {
    cwd: REPO_ROOT,
    maxBuffer: 16 * 1024 * 1024,
  })
    .toString()
    .split('\0')
    .filter(Boolean)
    .filter(
      file =>
        /\.(?:ts|mts|tsx|js)$/.test(file) &&
        !/(?:\.test\.|\/__tests__\/|\/test-helpers\/|\/migration-runner\/)/.test(file) &&
        !/^backend\/data-stores\/psql\/explain-(?:analyze|prepared)\.mts$/.test(file),
    )
  return files.map(fileName => ({
    fileName,
    source: readFileSync(join(REPO_ROOT, fileName), 'utf8'),
  }))
}

export function latestResultsPath(): string {
  const latest = readdirSync(OUTPUT_DIR)
    .filter(name => /^results-.*\.json$/.test(name))
    .toSorted()
    .at(-1)
  if (!latest) throw new Error('No EXPLAIN results found; run explain:run or pass a results path')
  return join(OUTPUT_DIR, latest)
}

export function readCompletedExplainResults(
  resultsPath: string,
  expectedScenarioIds: readonly string[],
): CapturedResult[] {
  const artifact = JSON.parse(readFileSync(resultsPath, 'utf8')) as unknown
  if (!artifact || typeof artifact !== 'object')
    throw new Error(`Invalid EXPLAIN results: ${resultsPath}`)
  const { results, completedScenarioIds } = artifact as Record<string, unknown>
  if (
    !Array.isArray(results) ||
    results.some(
      result =>
        typeof result?.name !== 'string' ||
        typeof result?.query_text !== 'string' ||
        typeof result?.scenario_id !== 'string',
    ) ||
    !Array.isArray(completedScenarioIds) ||
    completedScenarioIds.some(id => typeof id !== 'string')
  )
    throw new Error(`Invalid EXPLAIN results: ${resultsPath}`)
  const completed = new Set(completedScenarioIds as string[])
  const captured = new Set(results.map(result => result.scenario_id as string))
  if (
    completed.size !== expectedScenarioIds.length ||
    completedScenarioIds.length !== expectedScenarioIds.length ||
    expectedScenarioIds.some(id => !completed.has(id) || !captured.has(id)) ||
    [...captured].some(id => !completed.has(id))
  )
    throw new Error(`Incomplete EXPLAIN scenario artifact: ${resultsPath}`)
  return results as CapturedResult[]
}
