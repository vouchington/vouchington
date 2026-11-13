import type { TransactionQuery } from '@data-stores/psql/types'
import type { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type CopyrightOperationalCursor = {
  cursor_record_id: string | null
  sweep_upper_bound_record_id: string | null
  cursor_child_id: string | null
  cursor_edge_id: string | null
  cursor_phase: string | null
  cursor_blocker_phase: string | null
  cursor_blocker_child_id: string | null
  cursor_blocker_assessment_identity_id: string | null
  cursor_blocker_generation: string | null
}

/** A caller-owned pagination pass. It carries progress, never an admission decision. */
export type CopyrightOperationalScope = {
  recordIds: readonly string[]
  cursor: CopyrightOperationalCursor
}

export function createCopyrightOperationalCursor(): CopyrightOperationalCursor {
  return {
    cursor_record_id: null,
    sweep_upper_bound_record_id: null,
    cursor_child_id: null,
    cursor_edge_id: null,
    cursor_phase: null,
    cursor_blocker_phase: null,
    cursor_blocker_child_id: null,
    cursor_blocker_assessment_identity_id: null,
    cursor_blocker_generation: null,
  }
}

/** Scoped callers cannot read, claim, or reset the production singleton cursor. */
export async function readCopyrightOperationalCursor<Cursor extends CopyrightOperationalCursor>(
  transaction: TransactionQuery,
  kind: string,
  scope?: CopyrightOperationalScope,
): Promise<Cursor> {
  if (scope) return { ...scope.cursor } as Cursor
  await transaction(sql`/* seedCopyrightOperationalRetentionCursor */
    INSERT INTO copyright_notice_operational_retention_cursors (kind)
    VALUES (${kind}::copyright_notice_operational_retention_kinds) ON CONFLICT DO NOTHING`)
  const { rows } = await transaction<Cursor>(sql`/* lockCopyrightOperationalRetentionCursor */
    SELECT cursor_record_id, sweep_upper_bound_record_id, cursor_child_id, cursor_edge_id,
      cursor_phase, cursor_blocker_phase, cursor_blocker_child_id,
      cursor_blocker_assessment_identity_id, cursor_blocker_generation
    FROM copyright_notice_operational_retention_cursors
    WHERE kind = ${kind}::copyright_notice_operational_retention_kinds FOR UPDATE`)
  return rows[0]!
}

/** An aborted SQL page must not publish even in-memory pagination progress. */
export async function commitCopyrightOperationalCursor(
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
  cursor: CopyrightOperationalCursor,
  scope?: CopyrightOperationalScope,
): Promise<void> {
  await transaction.commit()
  if (scope) Object.assign(scope.cursor, cursor)
}
