import { beginTransaction } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import { copyrightRetentionEligibleSql } from './retention-erasure-eligibility.mts'
import { lockCopyrightRetentionCase } from './retention-erasure-preservation.mts'
import { exclusiveCaseThreadTokenScopeSql } from './retention-erasure-thread-tokens.mts'
import { lockCopyrightEmailThreadTokens } from './email-thread-ancestors.mts'
import { lockCopyrightOperationalThreadCase } from './operational-retention-thread-lock.mts'
import { deleteCaseThreadPage } from './operational-retention-thread-page.mts'

const DAY_MS = 24 * 60 * 60 * 1000

type PageResult = { scanned: number; deleted: number; hasMore: boolean }

async function sweepPage(
  now: Date,
  cutoff: Date,
  cutoffId: string,
  batchSize: number,
): Promise<PageResult> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* seedCopyrightThreadRetentionCursor */
    INSERT INTO copyright_notice_operational_retention_cursors (kind)
    VALUES ('email_thread_references') ON CONFLICT DO NOTHING`)
  const { rows: cursorRows } = await transaction<{
    cursor_record_id: string | null
    sweep_upper_bound_record_id: string | null
  }>(sql`/* lockCopyrightThreadRetentionCursor */
    SELECT cursor_record_id, sweep_upper_bound_record_id
    FROM copyright_notice_operational_retention_cursors
    WHERE kind = 'email_thread_references' FOR UPDATE`)
  const cursor = cursorRows[0]!
  const upperBound = cursor.sweep_upper_bound_record_id ?? cutoffId
  const { rows: candidates } = await transaction<{ id: string }>(sql`/* scanCopyrightThreadCase */
    SELECT id FROM copyright_notices
    WHERE id > COALESCE(${cursor.cursor_record_id}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      AND id < LEAST(${upperBound}::uuid, ${cutoffId}::uuid)
    ORDER BY id LIMIT 1`)
  const noticeId = candidates[0]?.id
  if (!noticeId) {
    await transaction(sql`/* resetCopyrightThreadRetentionCursor */
      UPDATE copyright_notice_operational_retention_cursors
      SET cursor_record_id = NULL, sweep_upper_bound_record_id = NULL
      WHERE kind = 'email_thread_references'`)
    await transaction.commit()
    return { scanned: 0, deleted: 0, hasMore: false }
  }
  const { rows: pageTokens } = await transaction<{ id: string; lookup_digest: string }>(
    sql`
    /* selectCopyrightCaseThreadTokenLocks */
    SELECT id, lookup_digest FROM copyright_notice_email_thread_tokens WHERE `
      .append(exclusiveCaseThreadTokenScopeSql(noticeId))
      .append(sql` ORDER BY id LIMIT ${batchSize}`),
  )
  // ast-grep-ignore: no-three-sequential-awaits -- token, case replay, and legal party locks must follow one order before the eligibility recheck.
  await lockCopyrightEmailThreadTokens(
    transaction,
    pageTokens.map(row => row.lookup_digest),
  )
  await lockCopyrightOperationalThreadCase(transaction, noticeId)
  await lockCopyrightRetentionCase(transaction, noticeId)
  const { rows: eligible } = await transaction<{ id: string }>(
    sql`/* recheckCopyrightThreadCaseEligibility */`
      .append(copyrightRetentionEligibleSql(now, cutoff, 'operational_thread', noticeId))
      .append(sql` SELECT id FROM eligible WHERE id = ${noticeId}`),
  )
  if (eligible.length > 0) {
    // The marker and the first irreversible delete commit together. A replay between later pages
    // therefore cannot recreate an already removed old-source reference.
    await transaction(sql`/* retireCopyrightCaseThread */
      INSERT INTO copyright_notice_email_thread_retirements
        (copyright_notice_id, retired_before_intake_bound)
      VALUES (${noticeId}, ${upperBound}::uuid)
      ON CONFLICT (copyright_notice_id) DO UPDATE SET
        retired_before_intake_bound = CASE
          WHEN copyright_notice_email_thread_retirements.retired_before_intake_bound <
            EXCLUDED.retired_before_intake_bound THEN EXCLUDED.retired_before_intake_bound
          ELSE copyright_notice_email_thread_retirements.retired_before_intake_bound END`)
  }
  const result =
    eligible.length > 0
      ? await deleteCaseThreadPage(
          transaction,
          noticeId,
          batchSize,
          pageTokens.map(row => row.id),
        )
      : { deleted: 0, complete: true }
  await transaction(sql`/* advanceCopyrightThreadRetentionCursor */
    UPDATE copyright_notice_operational_retention_cursors
    SET cursor_record_id = ${result.complete ? noticeId : cursor.cursor_record_id}::uuid,
      sweep_upper_bound_record_id = ${upperBound}::uuid
    WHERE kind = 'email_thread_references'`)
  await transaction.commit()
  return { scanned: 1, deleted: result.deleted, hasMore: true }
}

export async function sweepCopyrightCaseThreads(options: {
  now?: Date
  replyDays: number
  batchSize: number
  maxBatches: number
}): Promise<PageResult> {
  const now = options.now ?? new Date()
  const cutoff = new Date(now.getTime() - options.replyDays * DAY_MS)
  const cutoffId = getMinUUIDv7ForDate(cutoff)
  let scanned = 0
  let deleted = 0
  let hasMore = false
  for (let batch = 0; batch < options.maxBatches; batch += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each committed cursor selects the next case.
    const page = await sweepPage(now, cutoff, cutoffId, options.batchSize) // no-mistakes-disable-line query-reached-per-item: each capped case transaction commits its durable keyset cursor before the next page.
    scanned += page.scanned
    deleted += page.deleted
    hasMore = page.hasMore
    if (!hasMore) break
  }
  return { scanned, deleted, hasMore }
}
