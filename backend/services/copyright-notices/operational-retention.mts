import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql, { type SQLStatement } from 'sql-template-strings'
import {
  copyrightEmailTokenGcCutoffId,
  deleteOrphanCopyrightEmailThreadTokens,
  isCopyrightEmailTokenGcConflict,
} from './operational-retention-token-gc.mts'
import { deleteAttemptBatch } from './operational-retention-attempt-batch.mts'
import {
  deleteExpiredCopyrightGuestCapabilities,
  lockCopyrightGuestCapabilityCases,
} from './operational-retention-guest-capabilities.mts'

type SweepResult = { scanned: number; deleted: number; hasMore: boolean }

const TABLES = {
  form_screening_attempts: 'copyright_notice_form_screening_attempts',
  action_attempts: 'copyright_notice_action_attempts',
  delivery_attempts: 'copyright_notice_delivery_attempts',
  guest_capabilities: 'copyright_notice_guest_capabilities',
  orphan_email_thread_tokens: 'copyright_notice_email_thread_tokens',
} as const

export type CopyrightOperationalSweepKind = keyof typeof TABLES

const DAY_MS = 24 * 60 * 60 * 1000

async function deleteSelected(
  transaction: TransactionQuery,
  kind: CopyrightOperationalSweepKind,
  ids: readonly string[],
  cutoff: Date,
  tokenGcCutoffId: string,
): Promise<number> {
  if (kind === 'action_attempts' || kind === 'delivery_attempts') {
    return deleteAttemptBatch(transaction, kind, ids, cutoff)
  }
  if (kind === 'form_screening_attempts') {
    const { rowCount } = await transaction(sql`/* deleteExpiredCopyrightFormScreeningAttempts */
      DELETE FROM copyright_notice_form_screening_attempts attempt
      WHERE attempt.id = ANY(${[...ids]}::uuid[])
        AND attempt.state <> 'pending'
        AND COALESCE(attempt.completed_at, attempt.failed_at) <= ${cutoff}
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_form_screening_work_items work
          WHERE work.attempt_id = attempt.id)
        AND EXISTS (
          SELECT 1 FROM copyright_notice_form_screening_attempts newer
          WHERE newer.copyright_notice_form_intake_id = attempt.copyright_notice_form_intake_id
            AND newer.attempt_number > attempt.attempt_number)`)
    return rowCount ?? 0
  }
  if (kind === 'orphan_email_thread_tokens') {
    return deleteOrphanCopyrightEmailThreadTokens(transaction, ids, tokenGcCutoffId)
  }
  return deleteExpiredCopyrightGuestCapabilities(transaction, ids, cutoff)
}

async function sweepPage(
  kind: CopyrightOperationalSweepKind,
  batchSize: number,
  cutoffId: string,
  cutoff: Date,
  tokenGcCutoffId: string,
  recordIds?: readonly string[],
): Promise<SweepResult> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* seedCopyrightOperationalRetentionCursor */
    INSERT INTO copyright_notice_operational_retention_cursors (kind)
    VALUES (${kind}::copyright_notice_operational_retention_kinds) ON CONFLICT DO NOTHING`)
  const { rows: cursorRows } = await transaction<{
    cursor_record_id: string | null
    sweep_upper_bound_record_id: string | null
  }>(sql`/* lockCopyrightOperationalRetentionCursor */
    SELECT cursor_record_id, sweep_upper_bound_record_id
    FROM copyright_notice_operational_retention_cursors
    WHERE kind = ${kind}::copyright_notice_operational_retention_kinds FOR UPDATE`)
  const cursor = cursorRows[0]!
  const upperBound = cursor.sweep_upper_bound_record_id ?? cutoffId
  const statement: SQLStatement =
    sql`/* scanCopyrightOperationalRetentionPage */ SELECT id FROM `.append(TABLES[kind])
      .append(sql` WHERE id > COALESCE(${cursor.cursor_record_id}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      AND id < LEAST(${upperBound}::uuid, ${cutoffId}::uuid)`)
  if (recordIds !== undefined) statement.append(sql` AND id = ANY(${recordIds}::uuid[])`)
  statement.append(sql`
      ORDER BY id LIMIT ${batchSize}`)
  const { rows: rawRows } = await transaction<{ id: string }>(statement)
  const rawIds = rawRows.map(row => row.id)
  if (kind === 'guest_capabilities' && rawIds.length > 0)
    await lockCopyrightGuestCapabilityCases(transaction, rawIds)
  // Lock only the already capped raw ID page. SKIP LOCKED cannot walk an unbounded
  // prefix of busy rows, and skipped rows become eligible again on the next pass.
  const { rows: lockedRows } =
    rawIds.length === 0
      ? { rows: [] as { id: string }[] }
      : await transaction<{ id: string }>(
          sql`/* lockCopyrightOperationalRetentionPage */ SELECT id FROM `
            .append(TABLES[kind])
            .append(sql` WHERE id = ANY(${rawIds}::uuid[]) FOR UPDATE SKIP LOCKED`),
        )
  const ids = lockedRows.map(row => row.id)
  let deleted = 0
  if (ids.length > 0) {
    await transaction(sql`/* enableCopyrightOperationalRetention */
      SET LOCAL app.copyright_operational_retention = 'on'`)
    deleted = await deleteSelected(transaction, kind, ids, cutoff, tokenGcCutoffId)
  }
  const hasMore = rawIds.length === batchSize
  await transaction(sql`/* advanceCopyrightOperationalRetentionCursor */
    UPDATE copyright_notice_operational_retention_cursors
    SET cursor_record_id = ${hasMore ? rawIds.at(-1)! : null}::uuid,
      sweep_upper_bound_record_id = ${hasMore ? upperBound : null}::uuid
    WHERE kind = ${kind}::copyright_notice_operational_retention_kinds`)
  await transaction.commit()
  return { scanned: rawIds.length, deleted, hasMore }
}

/** Each pass scans bounded UUIDv7 pages, including retained/latest rows, and resumes next tick. */
export async function sweepCopyrightOperationalRetention(
  kind: CopyrightOperationalSweepKind,
  options: {
    now?: Date
    retentionDays: number
    batchSize: number
    maxBatches: number
    recordIds?: readonly string[]
  },
): Promise<SweepResult> {
  const now = options.now ?? new Date()
  const cutoff = new Date(now.getTime() - options.retentionDays * DAY_MS)
  const cutoffId = getMinUUIDv7ForDate(cutoff)
  const tokenGcCutoffId = copyrightEmailTokenGcCutoffId(now)
  let scanned = 0
  let deleted = 0
  let hasMore = false
  // oxlint-disable no-await-in-loop -- the committed cursor determines the next page.
  for (let batch = 0; batch < options.maxBatches; batch += 1) {
    let page: SweepResult
    try {
      // no-mistakes-disable-next-line query-reached-per-item: each capped transaction commits its durable keyset cursor before the next page.
      page = await sweepPage(
        kind,
        options.batchSize,
        cutoffId,
        cutoff,
        tokenGcCutoffId,
        options.recordIds,
      )
    } catch (err) {
      if (kind !== 'orphan_email_thread_tokens' || !isCopyrightEmailTokenGcConflict(err)) throw err
      // The aborted page did not advance its cursor; resume on the next scheduled run.
      return { scanned, deleted, hasMore: false }
    }
    scanned += page.scanned
    deleted += page.deleted
    hasMore = page.hasMore
    if (!hasMore) break
  }
  // oxlint-enable no-await-in-loop
  return { scanned, deleted, hasMore }
}
