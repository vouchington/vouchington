import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { isMigrationSqlFile } from './policy-matchers.mts'
import { parsePostgresSql, type PostgresSqlExpressionRoot } from 'no-mistakes'

/**
 * Flags CREATE TABLE statements whose `id` column is a UUIDv7 primary key
 * (`PRIMARY KEY DEFAULT uuidv7()`) but whose `created_at` column is not
 * `GENERATED ALWAYS AS (uuid_extract_timestamp(id))`. For UUIDv7-keyed tables,
 * created_at must be derived from id rather than stored/defaulted independently.
 *
 * "UUIDv7 table" is detected solely from the id column's own PRIMARY KEY +
 * uuidv7() default — never from whether created_at already looks generated,
 * which would make the check circular and unable to catch the violation it
 * exists to catch.
 */
export async function checkUuidv7CreatedAtDdl(
  repoRoot: string,
  trackedFiles: string[],
  errors: string[],
): Promise<void> {
  for (const file of trackedFiles) {
    if (!isMigrationSqlFile(file)) continue

    const content = readFileSync(join(repoRoot, file), 'utf8')

    const facts = await parsePostgresSql({ sql: content })
    if (facts.diagnostics.length > 0) continue

    for (const table of facts.statements) {
      if (table.kind !== 'createTable') continue
      const tableName = table.table.parts.at(-1)?.value
      const idColumn = table.columns.find(column => column.name.value.toLowerCase() === 'id')
      if (!idColumn) continue
      const isPrimaryKey = [...table.constraints, ...idColumn.constraints].some(
        constraint =>
          constraint.kind === 'primaryKey' &&
          (constraint.columns.length === 0 ||
            constraint.columns.some(column => column.value === idColumn.name.value)),
      )
      if (
        !isPrimaryKey ||
        ddlFunction(idColumn.default?.root)?.name.parts.at(-1)?.value.toLowerCase() !== 'uuidv7'
      )
        continue

      const createdAtColumn = table.columns.find(
        column => column.name.value.toLowerCase() === 'created_at',
      )
      if (!createdAtColumn) continue
      const generated = ddlFunction(createdAtColumn.generated?.expression.root)
      const generatedFunction = generated?.name.parts.at(-1)?.value.toLowerCase()
      const defaultFunction = ddlFunction(createdAtColumn.default?.root)
        ?.name.parts.at(-1)
        ?.value.toLowerCase()
      const isGeneratedFromId =
        generatedFunction === 'uuid_extract_timestamp' &&
        generated?.argumentsComplete &&
        generated.arguments.some(
          argument =>
            argument.root.kind === 'columnReference' &&
            argument.root.name.parts.at(-1)?.value.toLowerCase() ===
              idColumn.name.value.toLowerCase(),
        )
      if (isGeneratedFromId) continue

      const lineNum = createdAtColumn.span?.start.line ?? 1
      const offendingDefault = generatedFunction
        ? `GENERATED ... AS (${generatedFunction}(...))`
        : defaultFunction
          ? `DEFAULT ${defaultFunction}()`
          : 'a non-generated default'
      errors.push(
        `::error file=${file},line=${lineNum}::${tableName}.created_at must be ` +
          `GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL because ${tableName}.id ` +
          `is a UUIDv7 primary key (found ${offendingDefault})`,
      )
    }
  }
}

/** Only casts/grouping may wrap the UUID policy's required root function call. */
function ddlFunction(
  root: PostgresSqlExpressionRoot | undefined,
): Extract<PostgresSqlExpressionRoot, { kind: 'functionCall' }> | null {
  if (!root) return null
  if (root.kind === 'cast' || root.kind === 'parenthesized') return ddlFunction(root.expression)
  return root.kind === 'functionCall' ? root : null
}
