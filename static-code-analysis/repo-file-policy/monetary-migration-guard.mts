import { extractSqlTables, isScalarBuiltinBigint } from './monetary-migration-tables.mts'

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
