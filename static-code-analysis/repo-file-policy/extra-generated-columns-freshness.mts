import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'
import { parse as parseYaml } from 'yaml'

const NO_MISTAKES_PATH = '.no-mistakes.yml'
const PLACEHOLDER_PATH = 'backend/data-stores/psql/migrations/.no-mistakes-schema-placeholder.sql'
const MIGRATIONS_SQL_INCLUDE = 'backend/data-stores/psql/migrations/**/*.sql'
const PREDICATE_RULE = 'postgres-generated-column-predicates'

type ExtraGeneratedColumn = {
  table?: unknown
  column?: unknown
  sourceColumn?: unknown
}

type NoMistakesRule = {
  rule?: unknown
  options?: {
    extraGeneratedColumns?: ExtraGeneratedColumn[]
    requireArgumentIsPrimaryKey?: unknown
    sqlInclude?: unknown
  }
}

type NoMistakesConfig = { rules?: NoMistakesRule[] }

/**
 * Checks that the generated-column allowlists still match the current schema and migration tree.
 * The caller supplies only tracked migration table names so this work stays in static CI.
 */
export function checkExtraGeneratedColumnsFreshness(
  repoRoot: string,
  trackedFiles: readonly string[],
  schema: Pick<SchemaSnapshot, 'tables'>,
  migrationCreateTableNames: ReadonlySet<string>,
): string[] {
  const errors: string[] = []
  const config = parseYaml(
    readFileSync(join(repoRoot, NO_MISTAKES_PATH), 'utf8'),
  ) as NoMistakesConfig
  const generatedColumnRule = config.rules?.find(
    rule => rule.rule === 'postgres-no-generated-column-writes',
  )
  if (generatedColumnRule === undefined) {
    errors.push(`::error file=${NO_MISTAKES_PATH}::generated-column write rule is missing`)
  } else if (
    JSON.stringify(generatedColumnRule.options?.sqlInclude) !==
    JSON.stringify([MIGRATIONS_SQL_INCLUDE])
  ) {
    errors.push(
      `::error file=${NO_MISTAKES_PATH}::generated-column sqlInclude must target ${MIGRATIONS_SQL_INCLUDE}`,
    )
  }

  if (trackedFiles.includes(PLACEHOLDER_PATH)) {
    errors.push(`::error file=${PLACEHOLDER_PATH}::schema placeholder must not be tracked`)
  }

  const expected = findGeneratedCreatedAtTables(schema)
  for (const table of migrationCreateTableNames) expected.delete(table)

  if (generatedColumnRule !== undefined) {
    compareExtraGeneratedCreatedAtTables(NO_MISTAKES_PATH, generatedColumnRule, expected, errors)
  }

  const predicateRules = config.rules?.filter(rule => rule.rule === PREDICATE_RULE) ?? []
  if (predicateRules.length !== 2) {
    errors.push(
      `::error file=${NO_MISTAKES_PATH}::expected two ${PREDICATE_RULE} rules, found ${predicateRules.length}`,
    )
  }
  for (const [index, rule] of predicateRules.entries()) {
    const file = `${NO_MISTAKES_PATH}#${PREDICATE_RULE}[${index}]`
    compareExtraGeneratedCreatedAtTables(file, rule, expected, errors)
    if (rule.options?.extraGeneratedColumns?.some(entry => entry.sourceColumn !== 'id')) {
      errors.push(`::error file=${file}::generated-column sourceColumn must be id`)
    }
    if (rule.options?.requireArgumentIsPrimaryKey !== false) {
      errors.push(`::error file=${file}::predicate rule must not require a primary-key argument`)
    }
  }

  return errors
}

export function findGeneratedCreatedAtTables(schema: Pick<SchemaSnapshot, 'tables'>): Set<string> {
  const tables = new Set<string>()
  for (const [table, metadata] of Object.entries(schema.tables)) {
    if (typeof metadata.columns.created_at?.generatedExpression === 'string') tables.add(table)
  }
  return tables
}

export function findExtraGeneratedCreatedAtTables(rule: NoMistakesRule): Set<string> {
  const extras = new Set<string>()
  for (const entry of rule.options?.extraGeneratedColumns ?? []) {
    if (typeof entry.table !== 'string' || entry.column !== 'created_at') continue
    extras.add(entry.table)
  }
  return extras
}

function compareExtraGeneratedCreatedAtTables(
  file: string,
  rule: NoMistakesRule,
  expected: ReadonlySet<string>,
  errors: string[],
): void {
  const actual = findExtraGeneratedCreatedAtTables(rule)
  for (const table of expected) {
    if (actual.has(table)) continue
    errors.push(`::error file=${file}::missing generated created_at table entry: ${table}`)
  }
  for (const table of actual) {
    if (expected.has(table)) continue
    errors.push(`::error file=${file}::stale generated created_at table entry: ${table}`)
  }
}
