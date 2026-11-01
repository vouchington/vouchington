import { readFile } from 'node:fs/promises'

export type PurgeForeignKey = {
  name: string
  child: string
  parent: string
  columns: string[]
  referencedColumns: string[]
  onDelete: string
}

export type PurgeIndex = {
  table: string
  name: string
  keys: string[]
  predicate: string | null
  unique: boolean
}

type Snapshot = {
  enums: Record<string, { values: string[] }>
  tables: Record<
    string,
    {
      foreignKeys: Record<
        string,
        {
          columns: string[]
          referencedColumns: string[]
          referencedTable: string
          onDelete: string
        }
      >
      indexes: Record<
        string,
        {
          accessMethod: string
          keys: Array<{ column: string | null }>
          predicate: string | null
          ready: boolean
          valid: boolean
          unique: boolean
        }
      >
      columns: Record<string, { type: string }>
    }
  >
}

/** Read canonical final-state metadata, without parsing migration SQL or opening a test database. */
export async function readCopyrightCasePurgeSchema(): Promise<{
  foreignKeys: PurgeForeignKey[]
  indexes: PurgeIndex[]
  columns: Record<string, string[]>
  columnTypes: Record<string, Record<string, string>>
  enumValues: Record<string, string[]>
}> {
  const source = await readFile(
    new URL('../../../data-stores/psql/schema-snapshot/schema.json', import.meta.url),
    'utf8',
  )
  const snapshot = JSON.parse(source) as Snapshot
  const foreignKeys: PurgeForeignKey[] = []
  const indexes: PurgeIndex[] = []
  const columns: Record<string, string[]> = {}
  const columnTypes: Record<string, Record<string, string>> = {}
  for (const [table, definition] of Object.entries(snapshot.tables)) {
    columns[table] = Object.keys(definition.columns)
    columnTypes[table] = Object.fromEntries(
      Object.entries(definition.columns).map(([name, column]) => [name, column.type]),
    )
    for (const [name, fk] of Object.entries(definition.foreignKeys)) {
      foreignKeys.push({
        name,
        child: table,
        parent: fk.referencedTable,
        columns: fk.columns,
        referencedColumns: fk.referencedColumns,
        onDelete: fk.onDelete,
      })
    }
    for (const [name, index] of Object.entries(definition.indexes)) {
      if (index.accessMethod !== 'btree' || !index.ready || !index.valid) continue
      const keys = index.keys.map(key => key.column)
      if (keys.some(key => key === null)) continue
      indexes.push({
        table,
        name,
        keys: keys as string[],
        predicate: index.predicate,
        unique: index.unique,
      })
    }
  }
  return {
    foreignKeys,
    indexes,
    columns,
    columnTypes,
    enumValues: Object.fromEntries(
      Object.entries(snapshot.enums).map(([name, definition]) => [name, definition.values]),
    ),
  }
}

export function reachablePurgeTables(foreignKeys: PurgeForeignKey[], roots: readonly string[]) {
  const tables = new Set(roots)
  let changed = true
  while (changed) {
    changed = false
    for (const fk of foreignKeys) {
      if (
        (fk.onDelete !== 'restrict' && fk.onDelete !== 'no action') ||
        !tables.has(fk.parent) ||
        tables.has(fk.child)
      )
        continue
      tables.add(fk.child)
      changed = true
    }
  }
  return tables
}

/** An equality prefix on the FK followed by cursor keys gives a bounded seek. */
export function hasPurgeCursorIndex(
  indexes: PurgeIndex[],
  table: string,
  fkColumns: readonly string[],
  cursorColumns: readonly string[],
) {
  const expected = [...fkColumns, ...cursorColumns.filter(column => !fkColumns.includes(column))]
  return indexes.some(index => {
    if (index.table !== table) return false
    if (index.predicate !== null) {
      const predicate = index.predicate.replaceAll(/[()]/g, '').trim()
      if (!fkColumns.some(column => predicate === `${column} IS NOT NULL`)) return false
    }
    const prefix = index.keys.slice(0, fkColumns.length)
    return (
      prefix.length === fkColumns.length &&
      fkColumns.every(column => prefix.includes(column)) &&
      ((index.unique && index.keys.length === fkColumns.length) ||
        expected
          .slice(fkColumns.length)
          .every((column, offset) => index.keys[fkColumns.length + offset] === column))
    )
  })
}
