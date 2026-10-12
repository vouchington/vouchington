import {
  parsePostgresSql,
  type PostgresSqlColumn,
  type PostgresSqlExpressionRoot,
  type PostgresSqlProceduralOccurrence,
  type PostgresSqlStatement,
} from 'no-mistakes'

import { maskSqlLiterals, stripSqlComments } from './sql-text-scanner-helpers.mts'

/** Check generated config-driven SQL, including statements inside DO blocks and literal EXECUTE
 * payloads. A UUIDv7 primary-key table's created_at must derive from its id. */
export async function findFirstUuidv7CreatedAtViolation(sql: string): Promise<string | null> {
  const facts = await parsePostgresSql({ sql: stripSqlComments(sql) })
  return findViolation(facts.statements)
}

function findViolation(statements: readonly PostgresSqlStatement[]): string | null {
  for (const statement of statements) {
    if (statement.kind === 'createTable') {
      const violation = tableViolation(statement)
      if (violation) return violation
    } else if (statement.kind === 'doBlock') {
      const violation = findViolation(statement.block.statements)
      if (violation) return violation
      if (!statement.block.complete || statement.block.diagnostics.length > 0) {
        return 'Procedural SQL facts are incomplete'
      }
      if (hasUnrepresentedUtility(statement.block.occurrences, statement.block.statements)) {
        return 'Procedural SQL contains unrepresented utility statements'
      }
    } else if (statement.kind === 'conditional') {
      for (const branch of statement.branches) {
        const violation = findViolation(branch.statements)
        if (violation) return violation
      }
    } else if (statement.kind === 'literalExecute') {
      const violation = findViolation(statement.execute.statements)
      if (violation) return violation
      if (!statement.execute.complete || statement.execute.diagnostics.length > 0) {
        return 'Literal EXECUTE SQL facts are incomplete'
      }
    } else if (statement.kind === 'other' && /\bEXECUTE\b/i.test(maskSqlLiterals(statement.sql))) {
      return 'EXECUTE statements must use literal SQL payloads'
    }
  }
  return null
}

function hasUnrepresentedUtility(
  occurrences: readonly PostgresSqlProceduralOccurrence[],
  statements: readonly PostgresSqlStatement[],
): boolean {
  // Procedural occurrences can expose a utility command inside a FOR/LOOP even when the
  // block reports complete and omits that command from its typed statement tree.
  const represented = new Set<string>()
  const collect = (nested: readonly PostgresSqlStatement[]): void => {
    for (const statement of nested) {
      represented.add(`${statement.span.start.offset}:${statement.span.end.offset}`)
      if (statement.kind === 'conditional') {
        for (const branch of statement.branches) collect(branch.statements)
      }
    }
  }
  collect(statements)
  const unrepresented = (nested: readonly PostgresSqlProceduralOccurrence[]): boolean =>
    nested.some(
      occurrence =>
        (occurrence.kind === 'utility' &&
          !represented.has(`${occurrence.span.start.offset}:${occurrence.span.end.offset}`)) ||
        unrepresented(occurrence.occurrences),
    )
  return unrepresented(occurrences)
}

function tableViolation(
  statement: Extract<PostgresSqlStatement, { kind: 'createTable' }>,
): string | null {
  const id = statement.columns.find(column => column.name.identity === 'id')
  if (!id || !isIdPrimaryKey(id, statement.constraints)) return null
  if (rootFunctionName(id.default?.root) !== 'uuidv7') return null

  const createdAt = statement.columns.find(column => column.name.identity === 'created_at')
  if (!createdAt || isGeneratedFromId(createdAt, id)) return null

  const tableName = statement.table.parts.at(-1)?.value ?? statement.table.sql
  return (
    `${tableName}.created_at must be GENERATED ALWAYS AS ` +
    `(uuid_extract_timestamp(id)) because ${tableName}.id is a UUIDv7 primary key`
  )
}

function isIdPrimaryKey(
  id: PostgresSqlColumn,
  constraints: Extract<PostgresSqlStatement, { kind: 'createTable' }>['constraints'],
): boolean {
  if (id.constraints.some(constraint => constraint.kind === 'primaryKey')) return true
  return constraints.some(
    constraint =>
      constraint.kind === 'primaryKey' &&
      constraint.columns.some(column => column.identity === id.name.identity),
  )
}

function isGeneratedFromId(createdAt: PostgresSqlColumn, id: PostgresSqlColumn): boolean {
  const root = unwrapExpression(createdAt.generated?.expression.root)
  if (root?.kind !== 'functionCall') return false
  if (root.name.parts.at(-1)?.identity !== 'uuid_extract_timestamp') return false
  return root.arguments.some(argument => {
    const column = unwrapParentheses(argument.root)
    return (
      column?.kind === 'columnReference' && column.name.parts.at(-1)?.identity === id.name.identity
    )
  })
}

function rootFunctionName(root: PostgresSqlExpressionRoot | undefined): string | undefined {
  const unwrapped = unwrapExpression(root)
  return unwrapped?.kind === 'functionCall' ? unwrapped.name.parts.at(-1)?.identity : undefined
}

function unwrapExpression(
  root: PostgresSqlExpressionRoot | undefined,
): PostgresSqlExpressionRoot | undefined {
  let current = root
  while (current?.kind === 'parenthesized' || current?.kind === 'cast') current = current.expression
  return current
}

function unwrapParentheses(root: PostgresSqlExpressionRoot): PostgresSqlExpressionRoot {
  let current = root
  while (current.kind === 'parenthesized') current = current.expression
  return current
}
