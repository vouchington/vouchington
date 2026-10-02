import type { SchemaTableSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

export type RelationalStorageOptions = {
  enforceCatalogFreshness?: boolean
}

export type ObservedRelationalColumns = {
  encodedReference: Set<string>
  json: Set<string>
  missingForeignKey: Set<string>
  ownPrimary: Set<string>
}

import { GENERATED_FK_ALIASES } from './relational-storage-catalog.mts'
import { SCHEMA_SNAPSHOT_PATH } from './schema-snapshot-loader.mts'

type ColumnSnapshot = SchemaTableSnapshot['columns'][string]

const KNOWN_NON_DOMAIN_TYPES = new Set([
  'bigint',
  'bigserial',
  'bit',
  'bit varying',
  'boolean',
  'box',
  'bytea',
  'character',
  'character varying',
  'cid',
  'cidr',
  'circle',
  'date',
  'double precision',
  'inet',
  'integer',
  'interval',
  'json',
  'jsonb',
  'line',
  'lseg',
  'macaddr',
  'macaddr8',
  'money',
  'name',
  'numeric',
  'oid',
  'path',
  'pg_lsn',
  'point',
  'polygon',
  'real',
  'smallint',
  'smallserial',
  'serial',
  'text',
  'tid',
  'time',
  'time with time zone',
  'time without time zone',
  'timestamp',
  'timestamp with time zone',
  'timestamp without time zone',
  'tsquery',
  'tsvector',
  'txid_snapshot',
  'uuid',
  'varbit',
  'varchar',
  'vector',
  'xid',
  'xid8',
  'xml',
])

const ENCODED_TEXT_TYPES = new Set([
  'text',
  'character varying',
  'varchar',
  'character',
  'char',
  'name',
])

export const ENCODED_KEY_NAME = /^(?:work|entity|relation|target)_key$/u

export function relationalStorageDiagnostic(column: string, message: string): string {
  return `::error file=${SCHEMA_SNAPSHOT_PATH}::${column}: ${message}`
}

export function coveredByForeignKey(table: SchemaTableSnapshot, name: string): boolean {
  return Object.values(table.foreignKeys).some(fk => fk.columns.includes(name))
}

export function typeBase(type: string): string {
  return type
    .toLowerCase()
    .trim()
    .replace(/(?:\[\])+$/u, '')
    .replace(/\s*\([^)]*\)\s*$/u, '')
    .trim()
}

export function isKnownColumnType(type: string, enums: Readonly<Record<string, unknown>>): boolean {
  const base = typeBase(type)
  return KNOWN_NON_DOMAIN_TYPES.has(base) || Object.hasOwn(enums, base)
}

export function isIndependentlyGenerated(column: ColumnSnapshot): boolean {
  const expression = column.defaultExpression?.toLowerCase() ?? ''
  return (
    column.identity != null ||
    /\buuidv7\s*\(/u.test(expression) ||
    /\bgen_random_uuid\s*\(/u.test(expression)
  )
}

export function isSolePrimaryKey(table: SchemaTableSnapshot, columnName: string): boolean {
  return table.primaryKey?.columns.length === 1 && table.primaryKey.columns[0] === columnName
}

export function isEncodedText(type: string): boolean {
  return ENCODED_TEXT_TYPES.has(typeBase(type))
}

function normalizeCheckBody(definition: string): string {
  let body = definition
    .trim()
    .replace(/\s+/gu, '')
    .toLowerCase()
    .replace(/^check/u, '')
  while (body.startsWith('(') && body.endsWith(')') && wrapsFully(body)) {
    body = body.slice(1, -1)
  }
  return body
}

function wrapsFully(value: string): boolean {
  let depth = 0
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character === '(') depth += 1
    else if (character === ')') depth -= 1
    if (depth === 0) return index === value.length - 1
    if (depth < 0) return false
  }
  return false
}

function hasExactCheck(table: SchemaTableSnapshot, expected: string): boolean {
  const normalizedExpected = normalizeCheckBody(expected)
  return Object.values(table.checkConstraints).some(
    definition => normalizeCheckBody(definition) === normalizedExpected,
  )
}

export function isGeneratedAlias(
  table: SchemaTableSnapshot,
  key: string,
  expression: string | null,
): boolean {
  const expected = GENERATED_FK_ALIASES.get(key)
  return (
    expected !== undefined &&
    expression === expected.expression &&
    expected.sourceColumns.every(name => coveredByForeignKey(table, name)) &&
    hasExactCheck(table, expected.oneTargetCheck)
  )
}
