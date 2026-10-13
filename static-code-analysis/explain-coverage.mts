import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { extractExecutedPostgresSql } from 'no-mistakes'

type SqlFact = Awaited<ReturnType<typeof extractExecutedPostgresSql>>[number]
type Source = { fileName: string; source: string }

const REPO_ROOT = resolve(import.meta.dirname, '..')
const OUTPUT_DIR = join(REPO_ROOT, 'backend/scripts/explain-analyze/output')
const RUNTIME_ROOTS = [
  'backend/services',
  'backend/modules',
  'backend/workers',
  'backend/data-stores',
]

export interface UncoveredRead {
  name: string
  fileName: string
  line: number
  group: string
}

export interface CoverageReport {
  annotatedStatements: number
  reads: number
  coveredReads: number
  uncoveredReads: UncoveredRead[]
}

export function isRead(sqlText: string | null): boolean {
  if (!sqlText) return false
  const statement = sqlText.replace(/^\s*\/\*[\s\S]*?\*\//, '').trimStart()
  if (/^(?:SELECT|TABLE)\b/i.test(statement)) return true
  return /^WITH\b/i.test(statement) && !/\b(?:INSERT|UPDATE|DELETE|MERGE)\b/i.test(statement)
}

export function stripPlanCacheMode(name: string): string {
  return name.replace(/:(?:force_custom_plan|force_generic_plan)$/, '')
}

function groupForFile(fileName: string): string {
  const parts = fileName.split('/')
  return parts.slice(1, 3).join('/')
}

export function buildCoverageReport(
  facts: readonly SqlFact[],
  capturedNames: readonly string[],
): CoverageReport {
  const covered = new Set(capturedNames.map(stripPlanCacheMode))
  let annotatedStatements = 0
  let reads = 0
  let coveredReads = 0
  const uncoveredReads: UncoveredRead[] = []

  for (const fact of facts) {
    if (!fact.annotation) continue
    annotatedStatements++
    if (!isRead(fact.sqlText)) continue
    reads++
    if (covered.has(fact.annotation)) {
      coveredReads++
      continue
    }
    uncoveredReads.push({
      name: fact.annotation,
      fileName: fact.fileName,
      line: fact.line,
      group: groupForFile(fact.fileName),
    })
  }

  return { annotatedStatements, reads, coveredReads, uncoveredReads }
}

export function formatCoverageReport(report: CoverageReport): string {
  const groups = new Map<string, UncoveredRead[]>()
  for (const read of report.uncoveredReads) {
    const group = groups.get(read.group) ?? []
    group.push(read)
    groups.set(read.group, group)
  }
  const lines = [
    `Annotated statements: ${report.annotatedStatements}`,
    `Reads: ${report.reads}`,
    `Covered reads: ${report.coveredReads}`,
    `Uncovered reads: ${report.uncoveredReads.length}`,
  ]
  for (const [group, reads] of [...groups].toSorted(
    ([leftName, left], [rightName, right]) =>
      right.length - left.length || leftName.localeCompare(rightName),
  )) {
    lines.push('', `${group} (${reads.length})`)
    for (const read of reads.toSorted(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.fileName.localeCompare(right.fileName) ||
        left.line - right.line,
    )) {
      lines.push(`  ${read.name} — ${read.fileName}:${read.line}`)
    }
  }
  return lines.join('\n')
}

function trackedRuntimeSources(): Source[] {
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
        !/(?:\.test\.|\/__tests__\/|\/test-helpers\/|\/migration-runner\/)/.test(file),
    )
  return files.map(fileName => ({
    fileName,
    source: readFileSync(join(REPO_ROOT, fileName), 'utf8'),
  }))
}

function latestResultsPath(): string {
  const latest = readdirSync(OUTPUT_DIR)
    .filter(name => /^results-.*\.json$/.test(name))
    .toSorted()
    .at(-1)
  if (!latest) throw new Error('No EXPLAIN results found; run explain:run or pass a results path')
  return join(OUTPUT_DIR, latest)
}

export async function reportCoverage(
  sources: Source[],
  resultsPath: string,
): Promise<CoverageReport> {
  const results = JSON.parse(readFileSync(resultsPath, 'utf8')) as unknown
  if (!Array.isArray(results) || results.some(result => typeof result?.name !== 'string')) {
    throw new Error(`Invalid EXPLAIN results: ${resultsPath}`)
  }
  const facts = await extractExecutedPostgresSql({
    sources,
    importSpecifier: '@data-stores/psql',
    executorFactoryNames: ['beginTransaction', 'beginBoundedTransaction'],
    executorTypeNames: ['TransactionQuery', 'QueryExecutor'],
  })
  return buildCoverageReport(
    facts,
    results.map(result => result.name as string),
  )
}

if (import.meta.main) {
  try {
    const pathArg = process.argv[2] === '--' ? process.argv[3] : process.argv[2]
    const resultsPath = pathArg ? resolve(pathArg) : latestResultsPath()
    console.log(formatCoverageReport(await reportCoverage(trackedRuntimeSources(), resultsPath)))
  } catch (err) {
    console.error(err)
    process.exitCode = 1
  }
}
