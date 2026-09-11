import type { QueryNode } from './postgres-runtime-query-syntax.mts'

export type SqlStatementBinding = {
  callUses: Array<{ argument: QueryNode; call: QueryNode; trustedExecutor: boolean }>
  declaration: QueryNode
  initializer: QueryNode | undefined
  isStaticallyAnalyzable: boolean
  text: string | null
}

export type ScopeBinding = SqlStatementBinding | null
