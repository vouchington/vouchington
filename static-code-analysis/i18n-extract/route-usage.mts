import { readFile } from 'node:fs/promises'
import type { DependencyResult } from 'no-mistakes'

/** Alias-shaped source literals; catalog membership filters incidental matches. */
const ALIAS_RE = /\b(?:extracted|common|nav|settings|shared)\.(?:[A-Za-z0-9_]+\.)*[A-Za-z0-9_]+\b/g

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

/** Finds exact alias literals in a no-mistakes closure without parsing source syntax. */
export async function aliasesFromDependencyResult(
  repoRoot: string,
  rootFiles: string[],
  result: DependencyResult,
  textCache: Map<string, Promise<string>> = new Map(),
): Promise<Set<string>> {
  const paths = result.files
    .map(entry => entry.path)
    .filter((value): value is string => typeof value === 'string')
  const aliases = new Set<string>()
  for (const relativePath of new Set([...rootFiles, ...paths])) {
    if (!/\.[cm]?[jt]sx?$/.test(relativePath)) continue
    let textPromise = textCache.get(relativePath)
    if (!textPromise) {
      textPromise = readFile(`${repoRoot}/${relativePath}`, 'utf8')
      textCache.set(relativePath, textPromise)
    }
    for (const match of (await textPromise).matchAll(ALIAS_RE)) aliases.add(match[0])
  }
  return aliases
}
