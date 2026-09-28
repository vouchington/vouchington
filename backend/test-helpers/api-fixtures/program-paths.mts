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

export const typescriptSymbolFlags = ts.SymbolFlags
export const typescriptTypeFlags = ts.TypeFlags
export const typescriptIndexKind = ts.IndexKind
export const isTypescriptArrowFunction = ts.isArrowFunction
export const isTypescriptBlock = ts.isBlock
export const isTypescriptCallExpression = ts.isCallExpression
export const isTypescriptExpressionStatement = ts.isExpressionStatement
export const isTypescriptFunctionDeclaration = ts.isFunctionDeclaration
export const isTypescriptFunctionExpression = ts.isFunctionExpression
export const isTypescriptIdentifier = ts.isIdentifier
export const isTypescriptNumericLiteral = ts.isNumericLiteral
export const isTypescriptObjectLiteralExpression = ts.isObjectLiteralExpression
export const isTypescriptPropertyAccessExpression = ts.isPropertyAccessExpression
export const isTypescriptSpreadAssignment = ts.isSpreadAssignment
export const isTypescriptStatement = ts.isStatement
export const isTypescriptStringLiteral = ts.isStringLiteral
export const isTypescriptVariableDeclaration = ts.isVariableDeclaration
export const forEachTypescriptChild = ts.forEachChild

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
