import { readFile } from 'node:fs/promises'
import type { DependencyResult } from 'no-mistakes'
import {
  type ClosureScanIssue,
  closureIssuesForFile,
  quotedAliasesFromText,
} from './route-source-scan.mts'
import {
  type UnresolvedImportExclusion,
  UNRESOLVED_IMPORT_EXCLUSIONS,
  isComputedImportExcluded,
} from './unresolved-imports.mts'

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

export function dependencyPaths(result: DependencyResult): string[] {
  return result.files
    .map(entry => entry.path)
    .filter((file): file is string => typeof file === 'string')
}

export async function scanDependencyResult(
  repoRoot: string,
  rootFiles: string[],
  result: DependencyResult,
  textCache: Map<string, Promise<string>> = new Map(),
  exclusions: readonly UnresolvedImportExclusion[] = UNRESOLVED_IMPORT_EXCLUSIONS,
): Promise<{ aliases: Set<string>; issues: ClosureScanIssue[] }> {
  const paths = result.files
    .map(entry => entry.path)
    .filter((value): value is string => typeof value === 'string')
  const aliases = new Set<string>()
  const issues: ClosureScanIssue[] = []
  for (const relativePath of new Set([...rootFiles, ...paths])) {
    if (!/\.[cm]?[jt]sx?$/.test(relativePath)) continue
    let textPromise = textCache.get(relativePath)
    if (!textPromise) {
      textPromise = readFile(`${repoRoot}/${relativePath}`, 'utf8')
      textCache.set(relativePath, textPromise)
    }
    const text = await textPromise
    for (const alias of quotedAliasesFromText(text)) aliases.add(alias)
    for (const issue of closureIssuesForFile(relativePath, text)) {
      if (
        issue.reason === 'computed dynamic import' &&
        isComputedImportExcluded(relativePath, exclusions)
      ) {
        continue
      }
      issues.push(issue)
    }
  }
  return { aliases, issues }
}
