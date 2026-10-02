import { isDeepStrictEqual } from 'node:util'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { COPYRIGHT_RETENTION_ERASURE } from '../../../services/copyright-notices/retention-erasure-spec.mts'

export type CopyrightRetentionRows = Record<string, Record<string, unknown>[]>

/** Every copyright column that can hold ciphertext, a storage key or a lookup token, by table. */
export async function readCopyrightSensitiveColumns(): Promise<Record<string, string[]>> {
  const { rows } = await read<{ table_name: string; columns: string[] }>(
    sql`/* readCopyrightSensitiveColumns */
      SELECT table_name::text, array_agg(column_name::text ORDER BY column_name) AS columns
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name LIKE 'copyright%'
        AND (column_name LIKE '%ciphertext' OR column_name LIKE '%storage_key'
          OR column_name LIKE '%lookup%')
      GROUP BY table_name`,
  )
  return Object.fromEntries(rows.map(row => [row.table_name, row.columns]))
}

/** Every erasable column of every row the retention sweep covers for one notice, by table. */
export async function readCopyrightRetentionColumns(
  noticeId: string,
): Promise<CopyrightRetentionRows> {
  const tables: CopyrightRetentionRows = {}
  for (const spec of COPYRIGHT_RETENTION_ERASURE) {
    const { rows } = await read<Record<string, unknown>>(
      sql`/* readCopyrightRetentionColumns */`
        .append(`\n SELECT id, ${Object.keys(spec.columns).join(', ')} FROM ${spec.table} WHERE `)
        .append(spec.scope(noticeId))
        .append(' ORDER BY id'),
    )
    tables[spec.table] = rows
  }
  return tables
}

/**
 * Every row the sweep covers for one notice with its erasable columns and `updated_at` removed:
 * what must be identical before and after an erasure, because the case keeps its legal skeleton.
 */
export async function readCopyrightRetentionSkeleton(
  noticeId: string,
): Promise<CopyrightRetentionRows> {
  const tables: CopyrightRetentionRows = {}
  for (const spec of COPYRIGHT_RETENTION_ERASURE) {
    const erasable = Object.keys(spec.columns)
      .map(column => `'${column}'`)
      .join(', ')
    const { rows } = await read<{ row: Record<string, unknown> }>(
      sql`/* readCopyrightRetentionSkeleton */`
        .append(
          `\n SELECT to_jsonb(erasable) - 'updated_at' - ARRAY[${erasable}]::text[] AS row FROM ${spec.table} erasable WHERE `,
        )
        .append(spec.scope(noticeId))
        .append(' ORDER BY erasable.id'),
    )
    tables[spec.table] = rows.map(entry => entry.row)
  }
  return tables
}

export async function readCopyrightRetentionMarker(
  noticeId: string,
): Promise<{ retention_days: number; erased_object_count: number } | null> {
  const { rows } = await read<{ retention_days: number; erased_object_count: number }>(
    sql`/* readCopyrightRetentionMarker */
      SELECT retention_days, erased_object_count FROM copyright_notice_retention_erasures
      WHERE copyright_notice_id = ${noticeId}`,
  )
  return rows[0] ?? null
}

/**
 * Compares the erasable columns read before and after a sweep. `uncovered` names spec tables no
 * fixture row exercised, `missing` rows that disappeared, and `unchanged` every non-null erasable
 * column that still holds its old value; a column that was null must stay null.
 */
export function findCopyrightRetentionGaps(
  before: CopyrightRetentionRows[],
  after: CopyrightRetentionRows[],
): { uncovered: string[]; missing: string[]; unchanged: string[] } {
  const gaps = { uncovered: [] as string[], missing: [] as string[], unchanged: [] as string[] }
  for (const spec of COPYRIGHT_RETENTION_ERASURE) {
    const rowsBefore = before.flatMap(entry => entry[spec.table] ?? [])
    const rowsAfter = after.flatMap(entry => entry[spec.table] ?? [])
    if (rowsBefore.length === 0) gaps.uncovered.push(spec.table)
    for (const row of rowsBefore) {
      const erased = rowsAfter.find(candidate => candidate.id === row.id)
      if (!erased) {
        gaps.missing.push(spec.table)
        continue
      }
      for (const column of Object.keys(spec.columns)) {
        const wasNull = row[column] === null
        const stillSame = isDeepStrictEqual(erased[column], row[column])
        if (wasNull !== stillSame) gaps.unchanged.push(`${spec.table}.${column}`)
      }
    }
  }
  return gaps
}
