import type { PostgresSqlExpression, PostgresSqlInsert } from 'no-mistakes'

import { excludedColumnRefName, type ExpressionNode } from './on-conflict-column-refs.mts'
import { volatileValueForm } from './on-conflict-volatility.mts'

function sourceExpressions(
  insert: PostgresSqlInsert,
  column: string,
): readonly PostgresSqlExpression[] | undefined {
  // Positional VALUES and omitted columns can supply a default; their source is unknown here.
  if (!insert.columns.some(name => name.parts.at(-1)?.identity === column)) return undefined
  const sources = insert.columnSources
  if (sources.kind !== 'mapped' || !sources.complete) return undefined
  const expressions: PostgresSqlExpression[] = []
  for (const source of sources.columns) {
    if (source.column.parts.at(-1)?.identity !== column) continue
    for (const item of source.sources) expressions.push(item.expression)
  }
  return expressions
}

function containsVolatileValue(node: ExpressionNode): boolean {
  return (
    volatileValueForm(node) !== undefined ||
    node.root.kind === 'parameter' ||
    node.children.some(containsVolatileValue)
  )
}

export function volatileForm(node: ExpressionNode, insert: PostgresSqlInsert): string | undefined {
  const direct = volatileValueForm(node)
  if (direct !== undefined) return direct
  const excluded = excludedColumnRefName(node)
  if (excluded === undefined) return undefined
  const sources = sourceExpressions(insert, excluded)
  return sources === undefined || sources.some(containsVolatileValue)
    ? `EXCLUDED.${excluded}`
    : undefined
}

/** A write-once COALESCE fallback must remain non-null when its volatile source is chosen. */
export function isSafeVolatileFallback(node: ExpressionNode, insert: PostgresSqlInsert): boolean {
  if (volatileValueForm(node) !== undefined) return true
  const excluded = excludedColumnRefName(node)
  if (excluded === undefined) return false
  const sources = sourceExpressions(insert, excluded)
  return (
    sources !== undefined &&
    sources.every(
      source => !containsVolatileValue(source) || volatileValueForm(source) !== undefined,
    )
  )
}
