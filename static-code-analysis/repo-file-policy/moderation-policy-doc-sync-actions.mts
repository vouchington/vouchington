import type { MarkdownSourceLocation } from './canonical-markdown-children.mts'
import type { LocatedDocToken } from './moderation-policy-doc-sync-actions-extractors.mts'

export function assertExactLocatedDocTokens({
  actual,
  errors,
  expected,
  fallbackSource,
  label,
}: {
  actual: readonly LocatedDocToken[]
  errors: string[]
  expected: readonly string[]
  fallbackSource: MarkdownSourceLocation
  label: string
}): void {
  const actualByToken = new Map<string, MarkdownSourceLocation>()
  for (const { source, token } of actual) actualByToken.set(token, source)
  const expectedSet = new Set(expected)
  for (const token of expected) {
    if (actualByToken.has(token)) continue
    actionError(errors, fallbackSource, `${label} ${token} is missing from report docs`)
  }
  for (const [token, source] of actualByToken) {
    if (expectedSet.has(token)) continue
    actionError(errors, source, `stale ${label} ${token} is documented`)
  }
}

export function actionError(
  errors: string[],
  source: MarkdownSourceLocation,
  message: string,
): void {
  errors.push(`::error file=${source.file},line=${source.line}::${source.file}: ${message}`)
}
