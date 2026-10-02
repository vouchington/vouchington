import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  eraseCopyrightRetentionTableSql,
  type CopyrightRetentionErasureTable,
} from '../../../services/copyright-notices/retention-erasure-spec.mts'

/** Every table the database lets a retention-erasure transaction touch, with its erasable columns. */
export async function readCopyrightRetentionAllowlist(): Promise<Record<string, string[]>> {
  const { rows } = await read<{ table_name: string; columns: string[] }>(
    sql`/* readCopyrightRetentionAllowlist */
      SELECT relname::text AS table_name,
        fn_copyright_retention_erasable_columns(relname::text) AS columns
      FROM pg_class
      WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p')
        AND fn_copyright_retention_erasable_columns(relname::text) IS NOT NULL`,
  )
  return Object.fromEntries(rows.map(row => [row.table_name, row.columns.toSorted()]))
}

/** `overwrite` is the sweep's own update; `delete` is what a permit must never reach. */
export type CopyrightRetentionGuardStatement = 'overwrite' | 'delete'

/**
 * Runs the sweep's overwrite, or a delete, against a table's rows for a notice in a transaction
 * that is always rolled back, optionally after the same `SET LOCAL` the sweep uses. Reports the
 * rows it changed, or the SQLSTATE the database rejected it with, so a test can see the
 * legal-record guards decide.
 */
export async function attemptCopyrightRetentionStatement(options: {
  spec: CopyrightRetentionErasureTable
  noticeId: string
  statement: CopyrightRetentionGuardStatement
  permit: boolean
}): Promise<{ affected: number } | { rejectedWith: string }> {
  const { spec, noticeId } = options
  const statement =
    options.statement === 'overwrite'
      ? eraseCopyrightRetentionTableSql(spec, noticeId)
      : sql`/* attemptCopyrightRetentionDelete */`
          .append(`\n    DELETE FROM ${spec.table} WHERE `)
          .append(spec.scope(noticeId))
  return attemptInRolledBackTransaction(statement, options.permit)
}

/**
 * With the permit on, overwrites one erasable column of a notice and, in the same statement,
 * moves its receipt snapshot (`policy_version`): the notice guard must still refuse it.
 */
export async function attemptCopyrightRetentionSnapshotChange(
  noticeId: string,
): Promise<{ affected: number } | { rejectedWith: string }> {
  return attemptInRolledBackTransaction(
    sql`/* attemptCopyrightRetentionSnapshotChange */
      UPDATE copyright_notices SET work_description = 'erased', policy_version = 'changed'
      WHERE id = ${noticeId}`,
    true,
  )
}

async function attemptInRolledBackTransaction(
  statement: ReturnType<typeof sql>,
  permit: boolean,
): Promise<{ affected: number } | { rejectedWith: string }> {
  await using transaction = await beginTransaction()
  if (permit) await transaction(sql`SET LOCAL app.copyright_retention_erasure = 'on'`)
  try {
    const { rowCount } = await transaction(statement)
    return { affected: rowCount ?? 0 }
  } catch (err) {
    return { rejectedWith: (err as { code?: string }).code ?? 'unknown' }
  }
}

/**
 * Asks the permit function whether a row of `table` that changed only the named columns may be
 * written by an erasure transaction. The row is synthetic, so only the column names matter.
 */
export async function permitsCopyrightRetentionChange(options: {
  table: string
  changed: string[]
  permit: boolean
}): Promise<boolean> {
  const before = {
    id: 'row',
    untouched: 'same',
    ...Object.fromEntries(options.changed.map(c => [c, 'old'])),
  }
  const after = { ...before, ...Object.fromEntries(options.changed.map(c => [c, 'new'])) }
  await using transaction = await beginTransaction()
  await transaction(
    sql`SELECT set_config('app.copyright_retention_erasure', ${options.permit ? 'on' : 'off'}, true)`,
  )
  const { rows } = await transaction<{ permitted: boolean }>(
    sql`/* permitsCopyrightRetentionChange */
      SELECT fn_copyright_retention_erasure_permitted(
        ${options.table}, ${JSON.stringify(before)}::jsonb, ${JSON.stringify(after)}::jsonb
      ) AS permitted`,
  )
  return rows[0]?.permitted
}
