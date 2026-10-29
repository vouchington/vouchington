import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql, { type SQLStatement } from 'sql-template-strings'
import {
  deleteExpiredCopyrightGuestCapabilities,
  lockCopyrightGuestCapabilityCases,
} from './operational-retention-guest-capabilities.mts'
import { lockCopyrightOrphanTokenDigests } from './operational-retention-orphan-tokens.mts'

export type CopyrightOperationalSweepKind =
  | 'form_screening_attempts'
  | 'action_attempts'
  | 'delivery_attempts'
  | 'guest_capabilities'
  | 'orphan_email_thread_tokens'

type SweepResult = { scanned: number; deleted: number; hasMore: boolean }

const TABLES: Record<CopyrightOperationalSweepKind, string> = {
  form_screening_attempts: 'copyright_notice_form_screening_attempts',
  action_attempts: 'copyright_notice_action_attempts',
  delivery_attempts: 'copyright_notice_delivery_attempts',
  guest_capabilities: 'copyright_notice_guest_capabilities',
  orphan_email_thread_tokens: 'copyright_notice_email_thread_tokens',
}

const DAY_MS = 24 * 60 * 60 * 1000

async function deleteAttemptBatch(
  transaction: TransactionQuery,
  kind: 'action_attempts' | 'delivery_attempts',
  ids: readonly string[],
  cutoff: Date,
): Promise<number> {
  const table = TABLES[kind]
  const resultTable =
    kind === 'action_attempts'
      ? 'copyright_notice_action_attempt_results'
      : 'copyright_notice_delivery_attempt_results'
  const terminalAt =
    kind === 'action_attempts'
      ? 'COALESCE(result.completed_at, result.stale_at, result.blocked_at, result.failed_at, result.abandoned_at)'
      : 'COALESCE(result.sent_at, result.failed_at, result.bounced_at, result.abandoned_at)'
  const { rows } = await transaction<{ id: string }>(
    sql`/* selectExpiredCopyrightExecutionAttempts */ SELECT attempt.id FROM `
      .append(table)
      .append(sql` attempt JOIN `)
      .append(resultTable)
      .append(sql` result ON result.attempt_id = attempt.id
        WHERE attempt.id = ANY(${[...ids]}::uuid[])
          AND `)
      .append(terminalAt)
      .append(sql` <= ${cutoff}
          AND EXISTS (
            SELECT 1 FROM `)
      .append(table).append(sql` newer WHERE newer.work_item_id = attempt.work_item_id
              AND newer.attempt_number > attempt.attempt_number)
        ORDER BY attempt.id`),
  )
  const eligible = rows.map(row => row.id)
  if (eligible.length === 0) return 0
  await transaction(
    sql`/* deleteExpiredCopyrightExecutionResults */ DELETE FROM `
      .append(resultTable)
      .append(sql` WHERE attempt_id = ANY(${eligible}::uuid[])`),
  )
  const { rowCount } = await transaction(
    sql`/* deleteExpiredCopyrightExecutionAttempts */ DELETE FROM `
      .append(table)
      .append(sql` WHERE id = ANY(${eligible}::uuid[])`),
  )
  return rowCount ?? 0
}

async function deleteSelected(
  transaction: TransactionQuery,
  kind: CopyrightOperationalSweepKind,
  ids: readonly string[],
  cutoff: Date,
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
    const { rowCount } = await transaction(sql`/* deleteOrphanCopyrightEmailThreadTokens */
      DELETE FROM copyright_notice_email_thread_tokens token
      WHERE token.id = ANY(${[...ids]}::uuid[])
        AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_thread_references reference
          WHERE reference.token_id = token.id)
        AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links link
          WHERE link.matched_token_id = token.id)`)
    return rowCount ?? 0
  }
  return deleteExpiredCopyrightGuestCapabilities(transaction, ids, cutoff)
}

async function sweepPage(
  kind: CopyrightOperationalSweepKind,
  batchSize: number,
  cutoffId: string,
  cutoff: Date,
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
      AND id < LEAST(${upperBound}::uuid, ${cutoffId}::uuid)
      ORDER BY id LIMIT ${batchSize}`)
  const { rows: rawRows } = await transaction<{ id: string }>(statement)
  const rawIds = rawRows.map(row => row.id)
  if (kind === 'guest_capabilities' && rawIds.length > 0)
    await lockCopyrightGuestCapabilityCases(transaction, rawIds)
  if (kind === 'orphan_email_thread_tokens' && rawIds.length > 0)
    await lockCopyrightOrphanTokenDigests(transaction, rawIds)
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
    deleted = await deleteSelected(transaction, kind, ids, cutoff)
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
  options: { now?: Date; retentionDays: number; batchSize: number; maxBatches: number },
): Promise<SweepResult> {
  const now = options.now ?? new Date()
  const cutoff = new Date(now.getTime() - options.retentionDays * DAY_MS)
  const cutoffId = getMinUUIDv7ForDate(cutoff)
  let scanned = 0
  let deleted = 0
  let hasMore = false
  for (let batch = 0; batch < options.maxBatches; batch += 1) {
    // oxlint-disable-next-line no-await-in-loop -- the committed cursor determines the next page.
    const page = await sweepPage(kind, options.batchSize, cutoffId, cutoff) // no-mistakes-disable-line query-reached-per-item: each capped transaction commits its durable keyset cursor before the next page.
    scanned += page.scanned
    deleted += page.deleted
    hasMore = page.hasMore
    if (!hasMore) break
  }
  return { scanned, deleted, hasMore }
}
