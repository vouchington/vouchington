import { readFile } from 'node:fs/promises'
import { parsePostgresSql } from 'no-mistakes'

/** Compare fresh CREATE ordering with the same ordinal metadata used by the strict live gate. */
export async function readPublicationMigrationColumnOrders() {
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
  const facts = await parsePostgresSql({ sql: migration, fileName: 'publication-identity.sql' })
  if (facts.diagnostics.length > 0) {
    throw new Error(
      `Unable to analyze publication migration: ${facts.diagnostics.map(diagnostic => diagnostic.message).join('; ')}`,
    )
  }
  return facts.statements.flatMap(statement => {
    if (statement.kind !== 'createTable') return []
    const table = statement.table.parts.at(-1)?.value
    if (!table) throw new Error('Publication CREATE statement must name a table')
    const metadata = snapshot.tables[table]
    if (!metadata) throw new Error(`Publication table absent from snapshot: ${table}`)
    return [
      {
        table,
        declared: statement.columns.map(column => column.name.value),
        committed: Object.entries(metadata.columns)
          .toSorted(([, a], [, b]) => a.ordinalPosition - b.ordinalPosition)
          .map(([name]) => name),
      },
    ]
  })
}
