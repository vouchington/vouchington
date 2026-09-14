/** Augment static dependency closures with Next dynamic-import modules. */
import {
  analyzeProject,
  resolveCheck,
  type DependencyResult,
  type Relationship,
  type ResolveCheckBatchResult,
} from 'no-mistakes'
import { withI18nAnalysisBudget, type AnalysisBudgetOptions } from './analysis-budget.mts'

const BATCH_SIZE = 250
const SOURCE_FILE = /\.[cm]?[jt]sx?$/
const STATIC_RELATIONSHIPS: Relationship[] = ['import', 'import-static', 'import-type', 'workspace']

function chunks<T>(values: readonly T[]): T[][] {
  return Array.from({ length: Math.ceil(values.length / BATCH_SIZE) }, (_, index) =>
    values.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE),
  )
}

function sourceFiles(files: Iterable<string>): string[] {
  return [...new Set([...files].filter(file => SOURCE_FILE.test(file)))].toSorted()
}

export function dependencyResult(report: unknown, label: string): DependencyResult {
  const result =
    report &&
    typeof report === 'object' &&
    'type' in report &&
    report.type === 'dependencies' &&
    'result' in report
      ? report.result
      : undefined
  if (!result || typeof result !== 'object' || !('files' in result))
    throw new Error(`Missing dependency report for ${label}`)
  return result as DependencyResult
}

function filesFromDependencyResult(report: unknown, label: string): string[] {
  return dependencyPaths(dependencyResult(report, label))
}

export function dependencyPaths(result: DependencyResult): string[] {
  return result.files
    .map(entry => entry.path)
    .filter((file): file is string => typeof file === 'string')
}

function resolvedDynamicImports(result: ResolveCheckBatchResult): Map<string, Set<string>> {
  const targets = new Map<string, Set<string>>()
  for (const file of result.results) {
    const resolved = new Set<string>()
    for (const entry of file.imports) {
      if (
        entry.kind === 'dynamic' &&
        entry.status === 'resolved' &&
        typeof entry.resolved === 'string'
      )
        resolved.add(entry.resolved)
    }
    if (resolved.size > 0) targets.set(file.file, resolved)
  }
  return targets
}

async function resolveDynamicImports(
  root: string,
  files: readonly string[],
  budget: AnalysisBudgetOptions,
): Promise<Map<string, Set<string>>> {
  const targets = new Map<string, Set<string>>()
  for (const batch of chunks(files)) {
    const result = await withI18nAnalysisBudget(
      'resolveCheck',
      resolveCheck({ root, files: batch as [string, ...string[]] }),
      budget,
    )
    for (const [file, imports] of resolvedDynamicImports(result)) targets.set(file, imports)
  }
  return targets
}

async function staticDependencies(
  root: string,
  entries: readonly string[],
  budget: AnalysisBudgetOptions,
): Promise<Map<string, string[]>> {
  const dependencies = new Map<string, string[]>()
  for (const batch of chunks(entries)) {
    const analysis = await withI18nAnalysisBudget(
      'analyzeProject',
      analyzeProject({
        root,
        reports: batch.map(file => ({
          id: file,
          type: 'dependencies' as const,
          files: [file],
          relationships: STATIC_RELATIONSHIPS,
        })),
      }),
      budget,
    )
    for (const report of analysis.reports) {
      if (!report.id) throw new Error('Missing dynamic dependency report id')
      dependencies.set(report.id, filesFromDependencyResult(report, report.id))
    }
  }
  return dependencies
}

/**
 * Resolves dynamic imports from every static closure once, then batches dependency
 * expansion of each dynamic entry. The returned paths are additional per-route files.
 */
export async function dynamicImportClosure(
  root: string,
  staticFilesByRoute: ReadonlyMap<string, readonly string[]>,
  budget: AnalysisBudgetOptions = {},
): Promise<Map<string, string[]>> {
  const dynamicByFile = new Map<string, Set<string>>()
  const staticByDynamicEntry = new Map<string, string[]>()
  const resolvedFiles = new Set<string>()
  const expandedEntries = new Set<string>()
  let pendingFiles = sourceFiles([...staticFilesByRoute.values()].flatMap(files => [...files]))
  while (pendingFiles.length > 0) {
    const files = pendingFiles.filter(file => !resolvedFiles.has(file))
    for (const file of files) resolvedFiles.add(file)
    if (files.length === 0) break
    for (const [file, targets] of await resolveDynamicImports(root, files, budget))
      dynamicByFile.set(file, targets)
    const nextEntries = new Set<string>()
    for (const targets of dynamicByFile.values()) {
      for (const target of targets) if (!expandedEntries.has(target)) nextEntries.add(target)
    }
    const entries = sourceFiles(nextEntries)
    for (const entry of entries) expandedEntries.add(entry)
    if (entries.length === 0) {
      pendingFiles = []
      continue
    }
    for (const [entry, filesForEntry] of await staticDependencies(root, entries, budget))
      staticByDynamicEntry.set(entry, sourceFiles([entry, ...filesForEntry]))
    pendingFiles = sourceFiles(
      [...staticByDynamicEntry.values()].flatMap(filesForEntry => filesForEntry),
    )
  }
  const result = new Map<string, string[]>()
  for (const [route, initialFiles] of staticFilesByRoute) {
    const included = new Set(initialFiles)
    const pending = sourceFiles(initialFiles)
    for (let index = 0; index < pending.length; index++) {
      for (const entry of dynamicByFile.get(pending[index]) ?? []) {
        for (const file of staticByDynamicEntry.get(entry) ?? []) {
          if (!included.has(file)) {
            included.add(file)
            pending.push(file)
          }
        }
      }
    }
    result.set(route, sourceFiles(included))
  }
  return result
}
