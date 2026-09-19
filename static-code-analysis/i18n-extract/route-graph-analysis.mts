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
  return await withI18nAnalysisBudget(
    'analyzeProject',
    analyzeProject({
      root: repoRoot,
      jobs: 0,
      reports: discovered
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
        ),
    }),
    budget,
  )
}

export function reportsById(analysis: {
  reports: { id?: string; result: unknown }[]
}): Map<string, unknown> {
  const reports = new Map<string, unknown>()
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

export function uniqueClosureFiles(initialFiles: Map<string, string[]>): string[] {
  return [
    ...new Set([...initialFiles.values()].flat().filter(file => /\.[cm]?[jt]sx?$/.test(file))),
  ]
}

export async function analyzeUnresolvedImports(
  repoRoot: string,
  files: readonly string[],
  budget: AnalysisBudgetOptions,
): Promise<unknown> {
  if (files.length === 0) return undefined
  const [first, ...rest] = files
  const analysis = await withI18nAnalysisBudget(
    'resolveCheck',
    analyzeProject({
      root: repoRoot,
      jobs: 0,
      reports: [{ id: 'resolve-check', type: 'resolveCheck', files: [first, ...rest] }],
    }),
    budget,
  )
  return analysis.reports.find(report => report.id === 'resolve-check')?.result
}
