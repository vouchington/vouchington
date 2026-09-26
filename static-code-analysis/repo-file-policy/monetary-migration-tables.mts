import { parseSync } from '@libpg-query/parser'
import { isRecord } from './unknown-record.mts'

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

export function sqlStringNode(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.String)) return null
  return typeof value.String.sval === 'string' ? value.String.sval : null
}

export function sqlTypeName(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.names)) return ''
  return value.names.flatMap(sqlStringNode).join('.').toLowerCase()
}

export function sqlTypeIsArray(value: unknown): boolean {
  return isRecord(value) && Array.isArray(value.arrayBounds) && value.arrayBounds.length > 0
}

export function sqlTypeIsQuoted(value: unknown, content: string): boolean {
  return (
    isRecord(value) &&
    typeof value.location === 'number' &&
    Buffer.from(content, 'utf8')[value.location] === 0x22
  )
}

export function isScalarBuiltinBigint(column: SqlColumn): boolean {
  if (column.isArray) return false
  if (column.type === 'pg_catalog.int8') return true
  return column.type === 'int8' && !column.isQuotedType
}

export function extractSqlTables(content: string): SqlTable[] {
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
