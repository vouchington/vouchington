import { parsePostgresSql } from 'no-mistakes'

export async function extractPolymorphicTargetTables(
  content: string,
): Promise<Array<{ location: number; tableName: string }>> {
  const facts = await parsePostgresSql({ sql: content })
  if (facts.diagnostics.length > 0) {
    throw new Error(facts.diagnostics.map(diagnostic => diagnostic.message).join('\n'))
  }

  const tables: Array<{ location: number; tableName: string }> = []
  for (const statement of facts.statements) {
    if (statement.kind !== 'createTable') continue
    const tableName = statement.table.parts.at(-1)?.value
    if (!tableName) continue
    const columns = new Map(
      statement.columns.map(column => [column.name.value, column.generated !== null] as const),
    )
    const entityType = columns.get('entity_type')
    const entityId = columns.get('entity_id')
    if (entityType === undefined || entityId === undefined || entityType || entityId) continue
    tables.push({ location: statement.span.start.offset, tableName })
  }
  return tables
}
