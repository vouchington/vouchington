import { parsePostgresSql, type PostgresSqlType } from 'no-mistakes'

type SqlColumn = {
  isArray: boolean
  isQuotedType: boolean
  name: string
  requiresCurrencyAssociation: boolean
  type: string
}

export type SqlTable = {
  columns: SqlColumn[]
  name: string
}

// Keep the existing diagnostic names for PostgreSQL's normalized builtin aliases.
const BUILTIN_TYPE_NAMES: Readonly<Record<string, string>> = {
  bigint: 'pg_catalog.int8',
  'double precision': 'pg_catalog.float8',
  integer: 'pg_catalog.int4',
  numeric: 'pg_catalog.numeric',
  decimal: 'pg_catalog.numeric',
  real: 'pg_catalog.float4',
  smallint: 'pg_catalog.int2',
}

function sqlTypeName(type: PostgresSqlType): string {
  if (type.name)
    return type.name.parts
      .map(part => part.value)
      .join('.')
      .toLowerCase()
  const builtin = type.builtin?.replace(/\(.*$/, '').toLowerCase() ?? ''
  return BUILTIN_TYPE_NAMES[builtin] ?? builtin
}

function sqlColumn(
  name: string,
  type: PostgresSqlType,
  requiresCurrencyAssociation: boolean,
): SqlColumn {
  return {
    isArray: type.arrayDimensions.length > 0,
    isQuotedType: type.name?.parts[0]?.quoted ?? false,
    name: name.toLowerCase(),
    requiresCurrencyAssociation,
    type: sqlTypeName(type),
  }
}

export function isScalarBuiltinBigint(column: SqlColumn): boolean {
  if (column.isArray) return false
  if (column.type === 'pg_catalog.int8') return true
  return column.type === 'int8' && !column.isQuotedType
}

export async function extractSqlTables(content: string): Promise<SqlTable[]> {
  const parsed = await parsePostgresSql({ sql: content })
  if (parsed.diagnostics.length > 0) throw new Error(parsed.diagnostics[0].message)

  const tables: SqlTable[] = []
  for (const statement of parsed.statements) {
    if (statement.kind !== 'createTable') continue
    const name = statement.table.parts.at(-1)?.value.toLowerCase()
    if (!name) continue
    tables.push({
      columns: statement.columns.map(column => sqlColumn(column.name.value, column.dataType, true)),
      name,
    })
  }

  // Preserve the old two-pass order: all CREATE columns precede ALTER columns even when
  // statements are interleaved, and ALTERs for a table absent from CREATE form a table.
  for (const statement of parsed.statements) {
    if (statement.kind !== 'alterTable') continue
    const name = statement.table.parts.at(-1)?.value.toLowerCase()
    if (!name) continue
    const table = tables.find(value => value.name === name) ?? { columns: [], name }
    if (!tables.includes(table)) tables.push(table)
    for (const operation of statement.operations) {
      if (operation.kind === 'addColumn') {
        table.columns.push(sqlColumn(operation.column.name.value, operation.column.dataType, true))
      } else if (operation.kind === 'alterColumnType') {
        table.columns.push(sqlColumn(operation.column.value, operation.dataType, false))
      }
    }
  }

  return tables
}
