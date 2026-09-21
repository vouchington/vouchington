import { analyzeProject, type Relationship } from 'no-mistakes'
import { withI18nAnalysisBudget, type AnalysisBudgetOptions } from './analysis-budget.mts'
import { type RouteEntry } from './route-tree.mts'
import { dependencyPaths, dependencyResult } from './route-usage.mts'

export const DEPENDENCY_RELATIONSHIPS: Relationship[] = [
  'import-static',
  'import-dynamic',
  'import-type',
  'workspace',
]

export async function analyzeRouteDependencies(
  repoRoot: string,
  discovered: readonly RouteEntry[],
  globalFiles: readonly string[],
  budget: AnalysisBudgetOptions,
): Promise<{ reports: { id?: string; type: string; result: unknown }[] }> {
  const dependencyReports = discovered
    .map((route, index) => ({
      id: String(index),
      type: 'dependencies' as const,
      files: route.files,
      relationships: DEPENDENCY_RELATIONSHIPS,
    }))
    .concat(
      globalFiles.map((file, index) => ({
        id: `global:${index}`,
        type: 'dependencies' as const,
        files: [file],
        relationships: DEPENDENCY_RELATIONSHIPS,
      })),
    )
  return await withI18nAnalysisBudget(
    'analyzeProject',
    analyzeProject({
      root: repoRoot,
      jobs: 0,
      reports: [
        ...dependencyReports,
        {
          id: 'resolve-check',
          type: 'resolveCheckDependencies' as const,
          dependencyReportIds: dependencyReports.map(report => report.id),
        },
      ],
    }),
    budget,
  )
}

export function reportsById(analysis: {
  reports: { id?: string; result: unknown }[]
}): Map<string, { id?: string; result: unknown }> {
  const reports = new Map<string, { id?: string; result: unknown }>()
  for (const report of analysis.reports) {
    if (!report.id) throw new Error('Missing route dependency report id')
    reports.set(report.id, report)
  }
  return reports
}

export function initialClosureFiles(
  discovered: readonly RouteEntry[],
  globalFiles: readonly string[],
  reports: Map<string, unknown>,
): Map<string, string[]> {
  return new Map(
    discovered
      .map((route, index): [string, string[]] => [
        route.pattern,
        [
          ...route.files,
          ...dependencyPaths(dependencyResult(reports.get(String(index)), route.pattern)),
        ],
      ])
      .concat(
        globalFiles.map((file, index): [string, string[]] => [
          `global:${file}`,
          [file, ...dependencyPaths(dependencyResult(reports.get(`global:${index}`), file))],
        ]),
      ),
  )
}
