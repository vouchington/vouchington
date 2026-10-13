import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

export type Source = { fileName: string; source: string }

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
