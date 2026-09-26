import { readFile } from 'node:fs/promises'
import { loadModule, parseSync } from '@libpg-query/parser'

/** Compare fresh CREATE ordering with the same ordinal metadata used by the strict live gate. */
export async function readPublicationMigrationColumnOrders() {
  await loadModule()
  const [migration, snapshotJson] = await Promise.all([
    readFile(
      new URL(
        '../../../data-stores/psql/migrations/0732-00-00-post-publication-identity-snapshots.sql',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL('../../../data-stores/psql/schema-snapshot/schema.json', import.meta.url),
      'utf8',
    ),
  ])
  const snapshot = JSON.parse(snapshotJson) as {
    tables: Record<string, { columns: Record<string, { ordinalPosition: number }> }>
  }
  return (parseSync(migration).stmts ?? []).flatMap(raw => {
    const node = raw.stmt
    if (!node || !('CreateStmt' in node)) return []
    const table = node.CreateStmt.relation?.relname
    if (!table) throw new Error('Publication CREATE statement must name a table')
    const metadata = snapshot.tables[table]
    if (!metadata) throw new Error(`Publication table absent from snapshot: ${table}`)
    return [
      {
        table,
        declared: (node.CreateStmt.tableElts ?? []).flatMap(element =>
          element && 'ColumnDef' in element && element.ColumnDef.colname
            ? [element.ColumnDef.colname]
            : [],
        ),
        committed: Object.entries(metadata.columns)
          .sort(([, a], [, b]) => a.ordinalPosition - b.ordinalPosition)
          .map(([name]) => name),
      },
    ]
  })
}
