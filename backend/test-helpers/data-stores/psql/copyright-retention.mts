import { isDeepStrictEqual } from 'node:util'
import { read, write } from '@data-stores/psql'
import { v7 as uuidv7 } from 'uuid'
import sql from 'sql-template-strings'
import { COPYRIGHT_RETENTION_ERASURE } from '../../../services/copyright-notices/retention-erasure-spec.mts'

export type CopyrightRetentionRows = Record<string, Record<string, unknown>[]>

/** Every copyright column that can hold ciphertext, a storage-object reference or a lookup token. */
export async function readCopyrightSensitiveColumns(): Promise<Record<string, string[]>> {
  const { rows } = await read<{ table_name: string; columns: string[] }>(
    sql`/* readCopyrightSensitiveColumns */
      SELECT column_row.table_name::text, array_agg(column_name::text ORDER BY column_name) AS columns
      FROM information_schema.columns column_row
      JOIN pg_class relation ON relation.relname = column_row.table_name
        AND relation.relnamespace = 'public'::regnamespace AND NOT relation.relispartition
      WHERE table_schema = 'public' AND table_name LIKE 'copyright%'
        AND (column_name LIKE '%ciphertext' OR column_name LIKE '%storage_object_id'
          OR column_name LIKE '%lookup%')
      GROUP BY table_name`,
  )
  return Object.fromEntries(rows.map(row => [row.table_name, row.columns]))
}

/** Every erasable column of every row the retention sweep covers for one notice, by table. */
export async function readCopyrightRetentionColumns(
  noticeId: string,
  retainedRows?: CopyrightRetentionRows,
): Promise<CopyrightRetentionRows> {
  const tables: CopyrightRetentionRows = {}
  for (const spec of COPYRIGHT_RETENTION_ERASURE) {
    const tokenIds = retainedRows?.[spec.table]?.map(row => row.id)
    const scope =
      spec.table === 'copyright_notice_email_thread_tokens' && tokenIds
        ? sql`id = ANY(${tokenIds}::uuid[])`
        : spec.scope(noticeId)
    const { rows } = await read<Record<string, unknown>>(
      sql`/* readCopyrightRetentionColumns */`
        .append(`\n SELECT id, ${Object.keys(spec.columns).join(', ')} FROM ${spec.table} WHERE `)
        .append(scope)
        .append(' ORDER BY id'),
    )
    tables[spec.table] = rows
  }
  return tables
}

/**
 * Every row the sweep covers for one notice with erasable fields and operational fence timestamps removed:
 * what must be identical before and after an erasure, because the case keeps its legal skeleton.
 */
export async function readCopyrightRetentionSkeleton(
  noticeId: string,
  retainedRows?: CopyrightRetentionRows,
): Promise<CopyrightRetentionRows> {
  const tables: CopyrightRetentionRows = {}
  for (const spec of COPYRIGHT_RETENTION_ERASURE) {
    const rowName = spec.table === 'copyright_notice_email_thread_tokens' ? spec.table : 'erasable'
    const alias = rowName === 'erasable' ? ' erasable' : ''
    const tokenIds = retainedRows?.[spec.table]?.map(row => row.id)
    const scope =
      spec.table === 'copyright_notice_email_thread_tokens' && tokenIds
        ? sql`id = ANY(${tokenIds}::uuid[])`
        : spec.scope(noticeId)
    const erasable = Object.keys(spec.columns)
      .map(column => `'${column}'`)
      .join(', ')
    const operationalFence =
      spec.table === 'copyright_notice_email_intake_receipts' ? " - 'erased_at'" : ''
    const { rows } = await read<{ row: Record<string, unknown> }>(
      sql`/* readCopyrightRetentionSkeleton */`
        .append(
          `\n SELECT to_jsonb(${rowName}) - 'updated_at'${operationalFence} - ARRAY[${erasable}]::text[] AS row FROM ${spec.table}${alias} WHERE `,
        )
        .append(scope)
        .append(` ORDER BY ${rowName}.id`),
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

export async function readCopyrightRetentionLifecycleClock(noticeId: string): Promise<Date | null> {
  const { rows } = await read<{ last_lifecycle_activity_at: Date | null }>(
    sql`/* readCopyrightRetentionLifecycleClock */
      SELECT last_lifecycle_activity_at FROM copyright_notices WHERE id = ${noticeId}`,
  )
  if (!rows[0]) throw new Error('Copyright notice disappeared')
  return rows[0].last_lifecycle_activity_at
}

/** Record evidence activity at an exact millisecond without changing existing immutable events. */
export async function recordCopyrightRetentionEvidenceActivity(
  noticeId: string,
  at: Date,
): Promise<Date> {
  const { rows } = await write<{
    created_at: Date
  }>(sql`/* recordCopyrightRetentionEvidenceActivity */
    INSERT INTO copyright_notice_lifecycle_changes
      (id, copyright_notice_id, change_type, copyright_notice_evidence_artifact_id)
    SELECT ${uuidv7({ msecs: at.getTime() })}, ${noticeId}, 'evidence_artifact_recorded', artifact.id
    FROM copyright_notice_evidence_artifacts artifact
    JOIN copyright_notice_submissions submission ON submission.id = artifact.copyright_notice_submission_id
    WHERE submission.copyright_notice_id = ${noticeId}
    ORDER BY artifact.id LIMIT 1
    RETURNING created_at`)
  if (!rows[0]) throw new Error('Copyright evidence activity was not recorded')
  return rows[0].created_at
}
