import { parseSql } from 'vouchington-tooling/sql-ast'

export function extractPolymorphicTargetTables(
  content: string,
): Array<{ location: number; tableName: string }> {
  const tables: Array<{ location: number; tableName: string }> = []
  const parseResult = parseSql(content)
  for (const rawStmt of parseResult.stmts ?? []) {
    const node = rawStmt.stmt
    if (!node || !('CreateStmt' in node)) continue
    const statement = node.CreateStmt
    const tableName = statement.relation?.relname
    if (!tableName) continue
    const columns = new Map(
      (statement.tableElts ?? []).flatMap(element => {
        if (!element || !('ColumnDef' in element)) return []
        const column = element.ColumnDef
        const generated = (column.constraints ?? []).some(
          constraint =>
            constraint &&
            'Constraint' in constraint &&
            constraint.Constraint?.contype === 'CONSTR_GENERATED',
        )
        return column.colname ? [[column.colname, generated] as const] : []
      }),
    )
    const entityType = columns.get('entity_type')
    const entityId = columns.get('entity_id')
    if (entityType === undefined || entityId === undefined || entityType || entityId) continue
    tables.push({ location: rawStmt.stmt_location ?? 0, tableName })
  }
  return tables
}
