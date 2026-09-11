import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { isMigrationSqlFile } from './policy-matchers.mts'
import { extractCreateTableMetadata, lineOfUtf8ByteOffset } from './sql-ast.mts'

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
export function checkUuidv7CreatedAtDdl(
  repoRoot: string,
  trackedFiles: string[],
  errors: string[],
): void {
  for (const file of trackedFiles) {
    if (!isMigrationSqlFile(file)) continue

    const content = readFileSync(join(repoRoot, file), 'utf8')

    let tables: ReturnType<typeof extractCreateTableMetadata>
    try {
      tables = extractCreateTableMetadata(content)
    } catch {
      continue
    }

    for (const table of tables) {
      const idColumn = table.columns.find(column => column.name.toLowerCase() === 'id')
      if (!idColumn?.isPrimaryKey || idColumn.defaultFunction !== 'uuidv7') continue

      const createdAtColumn = table.columns.find(
        column => column.name.toLowerCase() === 'created_at',
      )
      if (!createdAtColumn) continue
      const isGeneratedFromId =
        createdAtColumn.generatedFunction === 'uuid_extract_timestamp' &&
        createdAtColumn.generatedFunctionArgColumns.includes(idColumn.name.toLowerCase())
      if (isGeneratedFromId) continue

      const lineNum = lineOfUtf8ByteOffset(content, createdAtColumn.location ?? 0)
      const offendingDefault = createdAtColumn.generatedFunction
        ? `GENERATED ... AS (${createdAtColumn.generatedFunction}(...))`
        : createdAtColumn.defaultFunction
          ? `DEFAULT ${createdAtColumn.defaultFunction}()`
          : 'a non-generated default'
      errors.push(
        `::error file=${file},line=${lineNum}::${table.tableName}.created_at must be ` +
          `GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL because ${table.tableName}.id ` +
          `is a UUIDv7 primary key (found ${offendingDefault})`,
      )
    }
  }
}
