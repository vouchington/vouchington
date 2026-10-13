import { resolve } from 'node:path'
import { extractExecutedPostgresSql } from 'no-mistakes'
import { LEADING_QUERY_ANNOTATION_PATTERN } from '@vouchington/postgres'
import { EXPLAIN_SCENARIO_MANIFEST } from '../backend/scripts/explain-analyze/scenario-manifest.mts'
import { isRead, matchesCapturedSql } from './explain-coverage-sql.mts'
import {
  latestResultsPath,
  readCompletedExplainResults,
  trackedRuntimeSources,
  type CapturedResult,
  type Source,
} from './explain-coverage-files.mts'

export { isRead } from './explain-coverage-sql.mts'

type SqlFact = Awaited<ReturnType<typeof extractExecutedPostgresSql>>[number]

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
  ambiguousReads: UncoveredRead[]
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
  results: readonly CapturedResult[],
): CoverageReport {
  const captures = new Map<string, CapturedResult[]>()
  for (const result of results) {
    const annotation = result.query_text.match(LEADING_QUERY_ANNOTATION_PATTERN)?.[1]?.trim()
    if (!annotation) continue
    const name = stripPlanCacheMode(result.name)
    if (name !== annotation && !name.startsWith(`${annotation}:`)) continue
    const existing = captures.get(annotation) ?? []
    existing.push(result)
    captures.set(annotation, existing)
  }
  const annotationCounts = new Map<string, number>()
  for (const fact of facts) {
    if (fact.annotation)
      annotationCounts.set(fact.annotation, (annotationCounts.get(fact.annotation) ?? 0) + 1)
  }
  let annotatedStatements = 0
  let reads = 0
  let coveredReads = 0
  const uncoveredReads: UncoveredRead[] = []
  const ambiguousReads: UncoveredRead[] = []

  for (const fact of facts) {
    const annotation = fact.annotation
    if (!annotation) continue
    annotatedStatements++
    if (!isRead(fact.sqlText)) continue
    reads++
    const matchingCaptures = captures.get(annotation) ?? []
    const exactMatch =
      fact.complete &&
      matchingCaptures.some(result =>
        matchesCapturedSql(fact.sqlText, annotation, result.query_text),
      )
    const uniqueIncomplete =
      !fact.complete && fact.kind !== 'dynamic' && (annotationCounts.get(annotation) ?? 0) === 1
    if (matchingCaptures.length > 0 && (exactMatch || uniqueIncomplete)) {
      coveredReads++
      continue
    }
    const entry = {
      name: annotation,
      fileName: fact.fileName,
      line: fact.line,
      group: groupForFile(fact.fileName),
    }
    const destination =
      matchingCaptures.length > 0 && !fact.complete ? ambiguousReads : uncoveredReads
    destination.push(entry)
  }

  return { annotatedStatements, reads, coveredReads, uncoveredReads, ambiguousReads }
}

function formatGroups(entries: readonly UncoveredRead[]): string[] {
  const groups = new Map<string, UncoveredRead[]>()
  for (const read of entries) {
    const group = groups.get(read.group) ?? []
    group.push(read)
    groups.set(read.group, group)
  }
  const lines: string[] = []
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
  return lines
}

export function formatCoverageReport(report: CoverageReport): string {
  return [
    `Annotated statements: ${report.annotatedStatements}`,
    `Reads: ${report.reads}`,
    `Covered reads: ${report.coveredReads}`,
    `Uncovered reads: ${report.uncoveredReads.length}`,
    `Ambiguous reads: ${report.ambiguousReads.length}`,
    ...formatGroups(report.uncoveredReads),
    ...(report.ambiguousReads.length > 0
      ? [
          '',
          'Ambiguous captured names (review before adding a scenario)',
          ...formatGroups(report.ambiguousReads),
        ]
      : []),
  ].join('\n')
}

export async function reportCoverage(
  sources: Source[],
  resultsPath: string,
  expectedScenarioIds: readonly string[] = EXPLAIN_SCENARIO_MANIFEST,
): Promise<CoverageReport> {
  const results = readCompletedExplainResults(resultsPath, expectedScenarioIds)
  const cursorNames = ['createAsyncGeneratorFromCursor', 'executeHandlerWithCursorInBatches']
  const [rootFacts, cursorSubpathFacts] = await Promise.all([
    extractExecutedPostgresSql({
      sources,
      importSpecifier: '@data-stores/psql',
      executorNames: ['query', 'read', 'write', ...cursorNames],
      executorFactoryNames: ['beginTransaction', 'beginBoundedTransaction'],
      executorTypeNames: ['TransactionQuery', 'QueryExecutor', 'OwnedTransaction'],
    }),
    extractExecutedPostgresSql({
      sources,
      importSpecifier: '@data-stores/psql/cursors',
      executorNames: cursorNames,
    }),
  ])
  // Both import passes can find the same cursor call. Keep one fact per source callsite.
  const factKey = (fact: SqlFact) => JSON.stringify(fact)
  const rootKeys = new Set(rootFacts.map(factKey))
  return buildCoverageReport(
    [...rootFacts, ...cursorSubpathFacts.filter(fact => !rootKeys.has(factKey(fact)))],
    results,
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
