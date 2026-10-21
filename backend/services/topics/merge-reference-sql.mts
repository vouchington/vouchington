/** Identifiers and expressions come only from the reviewed merge inventory below. */
export type MergeReferenceTable = {
  table: string
  columns: readonly string[]
  collisionKey?: readonly string[]
  live?: string
}

export function buildReferenceMergeCtes(tables: readonly MergeReferenceTable[]): string[] {
  return tables.flatMap(({ table, columns, collisionKey, live }, index) => {
    const source = columns.map(column => `s.${column} = $1::uuid`).join(' OR ')
    const assignments = columns.map(column => `${column} = ${mapped(`s.${column}`)}`).join(', ')
    if (!collisionKey)
      return [
        `m${index} AS (
      UPDATE ${table} s SET ${assignments} WHERE ${source} RETURNING 1
    )`,
      ]
    const collides = collisionKey
      .map(
        column =>
          `d.${column} IS NOT DISTINCT FROM ${columns.includes(column) ? mapped(`s.${column}`) : `s.${column}`}`,
      )
      .join(' AND ')
    const collision = `EXISTS (SELECT 1 FROM ${table} d WHERE ${collides}
      AND (d.tableoid, d.ctid) <> (s.tableoid, s.ctid)
      ${live ? `AND ${live.replaceAll(/\b([a-z_]+_at)\b/g, 'd.$1')} AND ${live.replaceAll(/\b([a-z_]+_at)\b/g, 's.$1')}` : ''})`
    return [
      `d${index} AS (
      DELETE FROM ${table} s WHERE (${source}) AND ${collision} RETURNING 1
    )`,
      `m${index} AS (
      UPDATE ${table} s SET ${assignments}
      WHERE (${source}) AND NOT ${collision} RETURNING 1
    )`,
    ]
  })
}

export function mapped(column: string): string {
  return `CASE WHEN ${column} = $1::uuid THEN $2::uuid ELSE ${column} END`
}
