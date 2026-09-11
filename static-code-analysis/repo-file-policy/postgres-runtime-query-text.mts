import { isNode } from '../targeted-guardrails/ast-utils.mts'

import {
  sqlStatementBindings,
  type SqlStatementBinding,
} from './postgres-runtime-query-bindings.mts'
import { queryNodeText, type QueryNode } from './postgres-runtime-query-syntax.mts'

export { sqlStatementBindings, type SqlStatementBinding }

export function executedQueryText(
  node: QueryNode | undefined,
  bindings: Map<QueryNode, SqlStatementBinding>,
): string | null {
  const text = queryNodeText(node)
  if (text || !node) return text
  return executedQueryBinding(node, bindings)?.text ?? null
}

export function executedQueryBinding(
  node: QueryNode | undefined,
  bindings: Map<QueryNode, SqlStatementBinding>,
): SqlStatementBinding | null {
  if (!node) return null
  const binding = bindings.get(node)
  if (binding) return binding
  if (
    (node.type === 'TSAsExpression' ||
      node.type === 'TSSatisfiesExpression' ||
      node.type === 'TSNonNullExpression' ||
      node.type === 'ParenthesizedExpression' ||
      node.type === 'ChainExpression') &&
    isNode(node.expression)
  ) {
    return executedQueryBinding(node.expression, bindings)
  }
  return null
}
