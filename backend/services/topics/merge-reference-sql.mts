/** Identifiers and expressions come only from the reviewed merge inventory below. */
export type MergeReferenceTable = {
  table: string
  columns: readonly string[]
  collisionKey?: readonly string[]
  live?: string
  preferVerified?: boolean
}

export function buildReferenceMergeCtes(tables: readonly MergeReferenceTable[]): string[] {
  return tables.flatMap(({ table, columns, collisionKey, live, preferVerified }, index) => {
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
    if (preferVerified)
      return [
        `d${index} AS (
          DELETE FROM ${table} d USING ${table} s
          WHERE (${source}) AND ${collides}
            AND d.topic_id <> $1::uuid AND s.verified_at IS NOT NULL AND d.verified_at IS NULL
            AND s.rejected_at IS NULL AND s.revoked_at IS NULL
            AND d.rejected_at IS NULL AND d.revoked_at IS NULL RETURNING d.id
        )`,
        `losers${index} AS (
          DELETE FROM ${table} s WHERE (${source}) AND ${collision}
            AND NOT (s.verified_at IS NOT NULL AND EXISTS (SELECT 1 FROM ${table} d WHERE ${collides} AND d.id IN (SELECT id FROM d${index}))) RETURNING s.id
        )`,
        `m${index} AS (
          UPDATE ${table} s SET ${assignments}
          WHERE (${source}) AND (NOT ${collision} OR (s.verified_at IS NOT NULL
            AND EXISTS (SELECT 1 FROM ${table} d WHERE ${collides} AND d.id IN (SELECT id FROM d${index}))))
            AND (SELECT count(*) FROM d${index}) >= 0 RETURNING 1
        )`,
      ]
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
