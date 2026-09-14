import { extractCreateTableMetadata } from 'vouchington-tooling/sql-ast'

import { splitSqlStatements } from '../../../../data-stores/psql/migration-runner/sql-statements.mts'
import { extractDoBlocks } from './do-block-readers.mts'
import { executableSqlStrings } from './generated-ddl-execute-helpers.mts'
import { maskSqlLiterals, stripSqlComments } from './sql-text-scanner-helpers.mts'

/**
 * Flags CREATE TABLE statements whose `id` column is a UUIDv7 primary key
 * (`PRIMARY KEY DEFAULT uuidv7()`) but whose `created_at` column is not
 * `GENERATED ALWAYS AS (uuid_extract_timestamp(id))`. Mirrors
 * `static-code-analysis/repo-file-policy/uuidv7-created-at-ddl-guard.mts`, which only
 * scans migration files and never sees this config-driven generated SQL.
 *
 * "UUIDv7 table" is detected solely from the id column's own PRIMARY KEY + uuidv7()
 * default — never from whether created_at already looks generated, which would make
 * the check circular and unable to catch the violation it exists to catch.
 *
 * Also scans DO block bodies, and literal `EXECUTE` payloads within them: the real
 * PostgreSQL parser treats a dollar-quoted DO body as one opaque string, and a
 * dynamically executed literal is opaque again one level deeper, so a CREATE TABLE
 * nested in either is otherwise invisible to `extractCreateTableMetadata`. Mirrors
 * `findFirstGeneratedDdlViolation`'s own DO-block-and-EXECUTE-payload recursion in
 * `generated-ddl-guard-helpers.mts`.
 *
 * Requires `initSqlAst()` (from `vouchington-tooling/sql-ast`) to have resolved before
 * the first call.
 */
export function findFirstUuidv7CreatedAtViolation(sql: string): string | null {
  const topLevelViolation = findFirstUuidv7CreatedAtViolationIn(sql)
  if (topLevelViolation) return topLevelViolation

  for (const { body } of extractDoBlocks(stripSqlComments(sql))) {
    const violation = findFirstUuidv7CreatedAtViolationInDoBlockBody(stripSqlComments(body))
    if (violation) return violation
  }

  return null
}

function findFirstUuidv7CreatedAtViolationInDoBlockBody(body: string): string | null {
  for (const statement of splitSqlStatements(body)) {
    // Masked so that "CREATE TABLE" text inside an EXECUTE literal's own string
    // argument (or any other quoted content) cannot be mistaken for a real statement.
    const createTableMatch =
      /\bCREATE\s+(?:(?:(?:GLOBAL|LOCAL)\s+)?(?:TEMPORARY|TEMP)\s+|UNLOGGED\s+)?TABLE\b/is.exec(
        maskSqlLiterals(statement),
      )
    if (createTableMatch) {
      // The fallback splitter used inside a DO block body has no PL/pgSQL grammar, so
      // a leading BEGIN/DECLARE can end up glued onto the split statement. Slice from
      // the actual CREATE TABLE keyword so the parser sees valid standalone SQL.
      const violation = findFirstUuidv7CreatedAtViolationIn(statement.slice(createTableMatch.index))
      if (violation) return violation
      continue
    }

    for (const executableString of executableSqlStrings(statement) ?? []) {
      const violation = findFirstUuidv7CreatedAtViolationIn(stripSqlComments(executableString))
      if (violation) return violation
    }
  }
  return null
}

function findFirstUuidv7CreatedAtViolationIn(sql: string): string | null {
  let tables: ReturnType<typeof extractCreateTableMetadata>
  try {
    tables = extractCreateTableMetadata(sql)
  } catch {
    return null
  }

  for (const table of tables) {
    const idColumn = table.columns.find(column => column.name.toLowerCase() === 'id')
    if (!idColumn?.isPrimaryKey || idColumn.defaultFunction !== 'uuidv7') continue

    const createdAtColumn = table.columns.find(column => column.name.toLowerCase() === 'created_at')
    if (!createdAtColumn) continue

    const isGeneratedFromId =
      createdAtColumn.generatedFunction === 'uuid_extract_timestamp' &&
      createdAtColumn.generatedFunctionArgColumns.includes(idColumn.name.toLowerCase())
    if (isGeneratedFromId) continue

    return (
      `${table.tableName}.created_at must be GENERATED ALWAYS AS ` +
      `(uuid_extract_timestamp(id)) because ${table.tableName}.id is a UUIDv7 primary key`
    )
  }

  return null
}
