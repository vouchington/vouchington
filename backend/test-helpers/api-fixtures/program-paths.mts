import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))

export function normalizePath(path: string): string {
  return path.replaceAll('\\', '/')
}

export function repoRelativePath(path: string): string {
  if (!path.startsWith(repoRoot)) return normalizePath(path)
  return normalizePath(relative(repoRoot, path))
}

export function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: fileName => fileName,
    getCurrentDirectory: () => repoRoot,
    getNewLine: () => '\n',
  })
}

/** Rewrites compiler filenames to repo-relative paths inside a discovery result. */
export function relativizeContractTree<Value>(value: Value): Value {
  return relativize(value) as Value
}

function relativize(value: unknown): unknown {
  if (typeof value === 'string') return repoRelativePath(value)
  if (Array.isArray(value)) return value.map(relativize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, relativize(item)]))
  }
  return value
}
