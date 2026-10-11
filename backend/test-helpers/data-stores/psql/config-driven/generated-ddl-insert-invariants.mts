import { parsePostgresSql, type PostgresSqlInsert, type PostgresSqlStatement } from 'no-mistakes'

import { isConvergentOnConflict, isGuardedSelect } from './on-conflict-convergence.mts'
import { hasGeneratedArbiterViolation, hasReplayUnsafeTrigger } from './schema-snapshot-facts.mts'

/** Test-time replay guard for TypeScript-generated config-driven SQL. */
export async function findFirstUnguardedInsertViolation(sql: string): Promise<string | null> {
  return findViolation(sql, 0)
}

const MAX_NESTING = 32

async function findViolation(sql: string, depth: number): Promise<string | null> {
  if (depth >= MAX_NESTING) return sql.trim()
  const facts = await parsePostgresSql({ sql })
  if (facts.diagnostics.length > 0) return sql.trim()
  for (const statement of facts.statements) {
    const violation = await findStatementViolation(statement, depth)
    if (violation !== null) return violation
  }
  return null
}

async function findStatementViolation(
  statement: PostgresSqlStatement,
  depth: number,
): Promise<string | null> {
  switch (statement.kind) {
    case 'insert':
      return findInsertViolation(statement.insert, statement.sql, depth)
    case 'select':
      return findNestedViolations(statement.query.nestedStatements, depth)
    case 'wrapper':
      if (statement.wrapper.wrapperKind === 'functionDeclaration') return null
      if (
        statement.wrapper.wrapperKind === 'explain' &&
        statement.wrapper.execution === 'nonExecuting'
      ) {
        return null
      }
      if (!statement.wrapper.complete || statement.wrapper.diagnostics.length > 0) {
        return statement.sql.trim()
      }
      return findStatementsViolation(statement.wrapper.statements, depth)
    case 'doBlock':
      if (!statement.block.complete || statement.block.diagnostics.length > 0) {
        return statement.sql.trim()
      }
      return findStatementsViolation(statement.block.statements, depth)
    case 'literalExecute':
      if (!statement.execute.complete || statement.execute.diagnostics.length > 0) {
        return statement.sql.trim()
      }
      return findStatementsViolation(statement.execute.statements, depth)
    case 'conditional':
      for (const branch of statement.branches) {
        const violation = await findStatementsViolation(branch.statements, depth)
        if (violation !== null) return violation
      }
      return null
    default:
      return null
  }
}

async function findStatementsViolation(
  statements: readonly PostgresSqlStatement[],
  depth: number,
): Promise<string | null> {
  for (const statement of statements) {
    const violation = await findStatementViolation(statement, depth + 1)
    if (violation !== null) return violation
  }
  return null
}

async function findNestedViolations(
  nested: readonly { sql: string }[],
  depth: number,
): Promise<string | null> {
  for (const statement of nested) {
    if (!statement.sql) return '?'
    const violation = await findViolation(statement.sql, depth + 1)
    if (violation !== null) return violation
  }
  return null
}

async function findInsertViolation(
  insert: PostgresSqlInsert,
  sql: string,
  depth: number,
): Promise<string | null> {
  if (!insert.complete || insert.diagnostics.length > 0) return sql.trim()
  if (insert.source.kind === 'select') {
    const nestedViolation = await findNestedViolations(insert.source.query.nestedStatements, depth)
    if (nestedViolation !== null) return nestedViolation
  }
  const conflict = insert.onConflict
  if (conflict?.action.kind === 'doNothing') return null
  if (conflict?.action.kind === 'doUpdate') {
    if (
      isConvergentOnConflict(conflict, insert).convergent &&
      !hasReplayUnsafeTrigger(insert, conflict) &&
      !hasGeneratedArbiterViolation(insert, conflict)
    ) {
      return null
    }
  } else if (insert.source.kind === 'select' && isGuardedSelect(insert.source.query)) {
    return null
  }
  return sql.trim().replace(/;\s*$/, '')
}
