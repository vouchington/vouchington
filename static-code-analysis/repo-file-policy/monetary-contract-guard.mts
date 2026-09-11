import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'
import { checkMonetaryMigration, MONETARY_MIGRATION_PREFIX } from './monetary-migration-guard.mts'

const PUBLIC_CONTRACT_PREFIXES = [
  'api-fixtures/v1/',
  'backend/api/response-types/',
  'backend/api/v1/',
  'backend/tools/',
  'backend/types/',
  'web/lib/api/client/',
  'web/types/',
]

const PROVIDER_RAW_PREFIXES = ['backend/modules/stripe/', 'backend/services/stripe/']

const LEGACY_PUBLIC_IDENTIFIER =
  /\b(?:amount_cents|amount_dollars|amount_refunded_cents|cents_per_point|cost_usd|mrr_cents|price_cents)\b/g
const STORAGE_PUBLIC_IDENTIFIER =
  /\b[a-z][a-z0-9_]*_(?:minor_units|microunits)(?:_per_[a-z][a-z0-9_]*)?\b/g
const TYPESCRIPT_SCALAR_MONEY =
  /\b(?:annual_fee|credit_limit|total_credit_limit|stated_income|value_per_point)\??\s*:\s*(?:number|string|Decimal)\b/g
const INTEGER_MONEY_SUFFIX = /_(?:minor_units|microunits)(?:_per_[a-z][a-z0-9_]*)?$/
const LEGACY_MONEY_NAME = /(?:^|_)(?:cents|dollars)(?:_|$)|^(?:cents_per_point|cost_usd)$/
const MONEY_NAME_TOKEN =
  /(?:^|_)(?:amount|balance|bonus|cost|credit_limit|fee|income|mrr|price|refund|revenue|valuation)(?:_|$)/
const DECIMAL_OR_FLOAT_TYPES = /(?:numeric|decimal|double precision|float4|float8|real)/

function isPublicContractFile(file: string): boolean {
  if (!PUBLIC_CONTRACT_PREFIXES.some(prefix => file.startsWith(prefix))) return false
  if (PROVIDER_RAW_PREFIXES.some(prefix => file.startsWith(prefix))) return false
  return !/(?:^|\/)(?:__tests__\/|test-helpers\/)|\.(?:mock\.)?test\./.test(file)
}

function addPublicPatternErrors(
  file: string,
  content: string,
  pattern: RegExp,
  message: (match: string) => string,
  errors: string[],
): void {
  pattern.lastIndex = 0
  for (const match of content.matchAll(pattern)) {
    errors.push(`::error file=${file}::${file}: ${message(match[0])}`)
  }
}

export function checkMonetaryContractFile(file: string, content: string, errors: string[]): void {
  if (!isPublicContractFile(file)) return

  addPublicPatternErrors(
    file,
    content,
    LEGACY_PUBLIC_IDENTIFIER,
    name => `${name} is an ambiguous public money field; use nested Money or ScaledMoney`,
    errors,
  )
  addPublicPatternErrors(
    file,
    content,
    STORAGE_PUBLIC_IDENTIFIER,
    name => `${name} exposes a storage unit on a public boundary; use nested Money or ScaledMoney`,
    errors,
  )
  for (const pattern of [TYPESCRIPT_SCALAR_MONEY]) {
    addPublicPatternErrors(
      file,
      content,
      pattern,
      match => `${match.trim()} exposes scalar money; use nested Money or ScaledMoney`,
      errors,
    )
  }
}

export function checkMonetaryContracts(
  repoRoot: string,
  trackedFiles: string[],
  errors: string[],
  readTrackedFile?: (file: string) => string | null,
): void {
  for (const file of trackedFiles) {
    const needsMigrationCheck = file.startsWith(MONETARY_MIGRATION_PREFIX) && file.endsWith('.sql')
    const needsContractCheck = isPublicContractFile(file)
    if (!needsMigrationCheck && !needsContractCheck) continue
    const path = join(repoRoot, file)
    if (!statSync(path).isFile()) continue
    const content = readTrackedFile?.(file) ?? readFileSync(path, 'utf8')
    if (content === null) continue
    if (needsMigrationCheck) checkMonetaryMigration(file, content, errors)
    if (needsContractCheck) checkMonetaryContractFile(file, content, errors)
  }
}

/** Final storage facts complement, but never replace, migration authoring checks. */
export function checkMonetarySnapshot(
  schema: Pick<SchemaSnapshot, 'tables'>,
  errors: string[],
): void {
  for (const [tableName, table] of Object.entries(schema.tables)) {
    const currencyColumns = Object.keys(table.columns).filter(column =>
      column.endsWith('currency_code'),
    )
    for (const columnName of currencyColumns) {
      if (table.columns[columnName]?.type.toLowerCase() === 'text') continue
      errors.push(
        `::error file=backend/data-stores/psql/schema-snapshot/schema.json::${tableName}.${columnName} must be TEXT`,
      )
    }
    for (const [columnName, column] of Object.entries(table.columns)) {
      const qualifiedName = `${tableName}.${columnName}`
      if (LEGACY_MONEY_NAME.test(columnName)) {
        errors.push(
          `::error file=backend/data-stores/psql/schema-snapshot/schema.json::${qualifiedName} uses an ambiguous cents/dollars name; use *_minor_units or *_microunits`,
        )
        continue
      }
      const moneyMatch = INTEGER_MONEY_SUFFIX.exec(columnName)
      const type = column.type.toLowerCase()
      const isBigint = type === 'bigint' || type === 'int8' || type === 'pg_catalog.int8'
      if (moneyMatch && !isBigint) {
        errors.push(
          `::error file=backend/data-stores/psql/schema-snapshot/schema.json::${qualifiedName} stores integer money as ${column.type}; use scalar BIGINT integer units`,
        )
      } else if (MONEY_NAME_TOKEN.test(columnName) && DECIMAL_OR_FLOAT_TYPES.test(type)) {
        errors.push(
          `::error file=backend/data-stores/psql/schema-snapshot/schema.json::${qualifiedName} stores money as ${column.type}; use BIGINT integer units`,
        )
      }
      const fieldCurrencyName = moneyMatch
        ? `${columnName.slice(0, moneyMatch.index)}_currency_code`
        : null
      const hasCurrencyAssociation =
        currencyColumns.includes('currency_code') ||
        (fieldCurrencyName !== null && currencyColumns.includes(fieldCurrencyName))
      if (moneyMatch && !hasCurrencyAssociation) {
        errors.push(
          `::error file=backend/data-stores/psql/schema-snapshot/schema.json::${qualifiedName} has no currency_code association on its record`,
        )
      }
    }
  }
}
