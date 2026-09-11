import { Buffer } from 'node:buffer'
import { parseSync } from '@libpg-query/parser'

import { isRecord } from './unknown-record.mts'

export const MONETARY_MIGRATION_PREFIX = 'backend/data-stores/psql/migrations/'
const INTEGER_MONEY_SUFFIX = /_(?:minor_units|microunits)(?:_per_[a-z][a-z0-9_]*)?$/
const LEGACY_MONEY_NAME = /(?:^|_)(?:cents|dollars)(?:_|$)|^(?:cents_per_point|cost_usd)$/
const MONEY_NAME_TOKEN =
  /(?:^|_)(?:amount|balance|bonus|cost|credit_limit|fee|income|mrr|price|refund|revenue|valuation)(?:_|$)/
const DECIMAL_OR_FLOAT_SQL_TYPES = new Set([
  'decimal',
  'double precision',
  'float4',
  'float8',
  'numeric',
  'pg_catalog.float4',
  'pg_catalog.float8',
  'pg_catalog.numeric',
  'real',
])
type SqlColumn = {
  isArray: boolean
  isQuotedType: boolean
  name: string
  requiresCurrencyAssociation: boolean
  type: string
}

type SqlTable = {
  columns: SqlColumn[]
  name: string
}

function sqlStringNode(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.String)) return null
  return typeof value.String.sval === 'string' ? value.String.sval : null
}

function sqlTypeName(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.names)) return ''
  return value.names.flatMap(sqlStringNode).join('.').toLowerCase()
}

function sqlTypeIsArray(value: unknown): boolean {
  return isRecord(value) && Array.isArray(value.arrayBounds) && value.arrayBounds.length > 0
}

function sqlTypeIsQuoted(value: unknown, content: string): boolean {
  return (
    isRecord(value) &&
    typeof value.location === 'number' &&
    Buffer.from(content, 'utf8')[value.location] === 0x22
  )
}

function isScalarBuiltinBigint(column: SqlColumn): boolean {
  if (column.isArray) return false
  if (column.type === 'pg_catalog.int8') return true
  return column.type === 'int8' && !column.isQuotedType
}

function extractSqlTables(content: string): SqlTable[] {
  const tables: SqlTable[] = []
  const parsed = parseSync(content)

  for (const rawStatement of parsed.stmts ?? []) {
    const statement = rawStatement.stmt
    if (!statement || !('CreateStmt' in statement)) continue
    const create = statement.CreateStmt
    const tableName = create.relation?.relname
    if (!tableName) continue

    const columns: SqlColumn[] = []
    for (const tableElement of create.tableElts ?? []) {
      if (!tableElement || !('ColumnDef' in tableElement)) continue
      const column = tableElement.ColumnDef
      if (!column?.colname) continue
      columns.push({
        isArray: sqlTypeIsArray(column.typeName),
        isQuotedType: sqlTypeIsQuoted(column.typeName, content),
        name: column.colname.toLowerCase(),
        requiresCurrencyAssociation: true,
        type: sqlTypeName(column.typeName),
      })
    }
    tables.push({ columns, name: tableName.toLowerCase() })
  }

  for (const rawStatement of parsed.stmts ?? []) {
    const statement = rawStatement.stmt
    if (!statement || !('AlterTableStmt' in statement)) continue
    const alter = statement.AlterTableStmt
    const tableName = alter.relation?.relname
    if (!tableName) continue

    const name = tableName.toLowerCase()
    const table = tables.find(value => value.name === name) ?? { columns: [], name }
    if (!tables.includes(table)) tables.push(table)
    for (const commandNode of alter.cmds ?? []) {
      if (!commandNode || !('AlterTableCmd' in commandNode)) continue
      const command = commandNode.AlterTableCmd
      const isAddColumn = command.subtype === 'AT_AddColumn'
      const isAlterColumnType = command.subtype === 'AT_AlterColumnType'
      if (!isAddColumn && !isAlterColumnType) continue
      const definition = command.def
      if (!definition || !('ColumnDef' in definition)) continue
      const columnName = isAddColumn ? definition.ColumnDef.colname : command.name
      if (!columnName) continue
      const typeName = definition.ColumnDef.typeName
      table.columns.push({
        isArray: sqlTypeIsArray(typeName),
        isQuotedType: sqlTypeIsQuoted(typeName, content),
        name: columnName.toLowerCase(),
        requiresCurrencyAssociation: isAddColumn,
        type: sqlTypeName(typeName),
      })
    }
  }

  return tables
}

export function checkMonetaryMigration(file: string, content: string, errors: string[]): void {
  if (!file.startsWith(MONETARY_MIGRATION_PREFIX) || !file.endsWith('.sql')) return

  let tables: SqlTable[]
  try {
    tables = extractSqlTables(content)
  } catch (error) {
    errors.push(
      `::error file=${file}::${file}: could not parse monetary migration: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return
  }

  for (const table of tables) {
    const currencyColumns = table.columns.filter(column => column.name.endsWith('currency_code'))
    for (const currencyColumn of currencyColumns) {
      if (currencyColumn.type !== 'text') {
        errors.push(
          `::error file=${file}::${file}: ${table.name}.${currencyColumn.name} must be TEXT`,
        )
      }
    }
    for (const column of table.columns) {
      const qualifiedName = `${table.name}.${column.name}`
      if (LEGACY_MONEY_NAME.test(column.name)) {
        errors.push(
          `::error file=${file}::${file}: ${qualifiedName} uses an ambiguous cents/dollars name; use *_minor_units or *_microunits`,
        )
        continue
      }
      const moneyMatch = INTEGER_MONEY_SUFFIX.exec(column.name)
      if (moneyMatch && !isScalarBuiltinBigint(column)) {
        const displayedType = column.isArray ? `${column.type}[]` : column.type
        const storageDescription = DECIMAL_OR_FLOAT_SQL_TYPES.has(column.type)
          ? 'stores money'
          : 'stores integer money'
        errors.push(
          `::error file=${file}::${file}: ${qualifiedName} ${storageDescription} as ${displayedType}; use scalar BIGINT integer units`,
        )
      } else if (
        MONEY_NAME_TOKEN.test(column.name) &&
        DECIMAL_OR_FLOAT_SQL_TYPES.has(column.type)
      ) {
        errors.push(
          `::error file=${file}::${file}: ${qualifiedName} stores money as ${column.type}; use BIGINT integer units`,
        )
      }
      const fieldCurrencyName = moneyMatch
        ? `${column.name.slice(0, moneyMatch.index)}_currency_code`
        : null
      const hasCurrencyAssociation =
        currencyColumns.some(currency => currency.name === 'currency_code') ||
        (fieldCurrencyName !== null &&
          currencyColumns.some(currency => currency.name === fieldCurrencyName))
      if (moneyMatch && column.requiresCurrencyAssociation && !hasCurrencyAssociation) {
        errors.push(
          `::error file=${file}::${file}: ${qualifiedName} has no currency_code association on its record`,
        )
      }
    }
  }
}
