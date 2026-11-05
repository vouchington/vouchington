import { parsePostgresSql, type PostgresSqlInsert, type PostgresSqlStatement } from 'no-mistakes'

import { isConvergentOnConflict, isGuardedSelect } from './on-conflict-convergence.mts'
import type { SchemaSnapshotFacts } from './schema-snapshot-facts.mts'

export type InsertSchemaFacts = Pick<
  SchemaSnapshotFacts,
  'hasReplayUnsafeTrigger' | 'hasGeneratedArbiterViolation'
>

/** Replay guard. Callers pass bounded fixture facts or committed-snapshot facts. */
export async function findFirstUnguardedInsertViolation(
  sql: string,
  schemaFacts: InsertSchemaFacts,
): Promise<string | null> {
  return findViolation(sql, 0, schemaFacts)
}

const MAX_NESTING = 32

async function findViolation(
  sql: string,
  depth: number,
  schemaFacts: InsertSchemaFacts,
): Promise<string | null> {
  if (depth >= MAX_NESTING) return sql.trim()
  const parsed = await parsePostgresSql({ sql })
  if (parsed.diagnostics.length > 0) return sql.trim()
  return findStatementsViolation(parsed.statements, depth, schemaFacts)
}

async function findStatementViolation(
  statement: PostgresSqlStatement,
  depth: number,
  schemaFacts: InsertSchemaFacts,
): Promise<string | null> {
  if (statement.kind === 'insert')
    return findInsertViolation(statement.insert, statement.sql, depth, schemaFacts)
  if (statement.kind === 'select')
    return findNestedViolations(statement.query.nestedStatements, depth, schemaFacts)
  if (statement.kind === 'wrapper') {
    if (
      statement.wrapper.wrapperKind === 'functionDeclaration' ||
      (statement.wrapper.wrapperKind === 'explain' &&
        statement.wrapper.execution === 'nonExecuting')
    ) {
      return null
    }
    if (!statement.wrapper.complete || statement.wrapper.diagnostics.length > 0) {
      return statement.sql.trim()
    }
    return findStatementsViolation(statement.wrapper.statements, depth + 1, schemaFacts)
  }
  if (statement.kind === 'doBlock') {
    if (!statement.block.complete || statement.block.diagnostics.length > 0) {
      return statement.sql.trim()
    }
    return findStatementsViolation(statement.block.statements, depth + 1, schemaFacts)
  }
  if (statement.kind === 'literalExecute') {
    if (!statement.execute.complete || statement.execute.diagnostics.length > 0) {
      return statement.sql.trim()
    }
    return findStatementsViolation(statement.execute.statements, depth + 1, schemaFacts)
  }
  if (statement.kind === 'conditional') {
    for (const branch of statement.branches) {
      const violation = await findStatementsViolation(branch.statements, depth + 1, schemaFacts)
      if (violation !== null) return violation
    }
    return null
  }
  return null
}

async function findStatementsViolation(
  statements: readonly PostgresSqlStatement[],
  depth: number,
  schemaFacts: InsertSchemaFacts,
): Promise<string | null> {
  for (const statement of statements) {
    const violation = await findStatementViolation(statement, depth, schemaFacts)
    if (violation !== null) return violation
  }
  return null
}

async function findNestedViolations(
  nested: readonly { sql: string }[],
  depth: number,
  schemaFacts: InsertSchemaFacts,
): Promise<string | null> {
  for (const statement of nested) {
    if (!statement.sql) return '?'
    const violation = await findViolation(statement.sql, depth + 1, schemaFacts)
    if (violation !== null) return violation
  }
  return null
}

async function findInsertViolation(
  insert: PostgresSqlInsert,
  sql: string,
  depth: number,
  schemaFacts: InsertSchemaFacts,
): Promise<string | null> {
  if (!insert.complete || insert.diagnostics.length > 0) return sql.trim()
  if (insert.source.kind === 'select') {
    const nestedViolation = await findNestedViolations(
      insert.source.query.nestedStatements,
      depth,
      schemaFacts,
    )
    if (nestedViolation !== null) return nestedViolation
  }
  const conflict = insert.onConflict
  if (conflict?.action.kind === 'doNothing') return null
  if (conflict?.action.kind === 'doUpdate') {
    if (
      isConvergentOnConflict(conflict, insert).convergent &&
      !schemaFacts.hasReplayUnsafeTrigger(insert, conflict) &&
      !schemaFacts.hasGeneratedArbiterViolation(insert, conflict)
    ) {
      return null
    }
  } else if (insert.source.kind === 'select' && isGuardedSelect(insert.source.query)) {
    return null
  }
  return sql.trim().replace(/;\s*$/, '')
}
