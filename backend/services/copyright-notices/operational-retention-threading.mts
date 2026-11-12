import { beginTransaction } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import { copyrightOperationalThreadAdmissionSql } from './operational-retention-thread-eligibility.mts'
import { deleteCaseThreadPage, type ThreadPhase } from './operational-retention-thread-page.mts'
import { isCopyrightEmailTokenGcConflict } from './operational-retention-token-gc.mts'
import {
  advanceCopyrightThreadCaseCursor,
  resetCopyrightThreadRetentionCursor,
} from './operational-retention-thread-cursor.mts'
import {
  checkCopyrightThreadProofPage,
  type ThreadProofCursor,
} from './operational-retention-thread-proofs.mts'

const DAY_MS = 24 * 60 * 60 * 1000
type PageResult = { scanned: number; deleted: number; hasMore: boolean }

async function sweepPage(
  now: Date,
  cutoff: Date,
  cutoffId: string,
  batchSize: number,
): Promise<PageResult> {
  await using transaction = await beginTransaction({ serializable: true })
  await transaction(sql`/* seedCopyrightThreadRetentionCursor */
    INSERT INTO copyright_notice_operational_retention_cursors (kind)
    VALUES ('email_thread_references') ON CONFLICT DO NOTHING`)
  const { rows: cursorRows } = await transaction<
    ThreadProofCursor & {
      cursor_record_id: string | null
      sweep_upper_bound_record_id: string | null
      cursor_child_id: string | null
      cursor_edge_id: string | null
      cursor_phase: ThreadPhase | null
    }
  >(sql`/* lockCopyrightThreadRetentionCursor */
    SELECT cursor_record_id, sweep_upper_bound_record_id,
      cursor_child_id, cursor_edge_id, cursor_phase,
      cursor_blocker_phase, cursor_blocker_child_id, cursor_blocker_assessment_identity_id,
      cursor_blocker_generation
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
    await resetCopyrightThreadRetentionCursor(transaction)
    await transaction.commit()
    return { scanned: 0, deleted: 0, hasMore: false }
  }

  // One raw case link is selected by the (notice_id, id) index. An incomplete link remains
  // selected on the next tick; the phase and edge key are persisted with the case cursor.
  const { rows: links } = await transaction<{
    id: string
    copyright_notice_email_intake_id: string
    matched_token_id: string | null
  }>(sql`/* scanCopyrightThreadCaseLink */
    WITH owner AS MATERIALIZED (SELECT ${noticeId}::uuid AS notice_id)
    SELECT link.id, link.copyright_notice_email_intake_id, link.matched_token_id
    FROM owner CROSS JOIN LATERAL (
      SELECT id, copyright_notice_email_intake_id, matched_token_id
      FROM copyright_notice_email_intake_notice_links link
      WHERE link.copyright_notice_id = owner.notice_id
        AND link.id > COALESCE(${cursor.cursor_child_id}::uuid,
          '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY link.id LIMIT 1
    ) link`)
  const link = links[0]
  if (!link) {
    await advanceCopyrightThreadCaseCursor(transaction, noticeId, upperBound)
    await transaction.commit()
    return { scanned: 1, deleted: 0, hasMore: true }
  }

  const phase = cursor.cursor_phase ?? 'references'
  const { rows: references } =
    phase === 'references'
      ? await transaction<{ id: string }>(sql`
        /* scanCopyrightThreadIntakeReferences */
        WITH owner AS MATERIALIZED (
          SELECT ${link.copyright_notice_email_intake_id}::uuid AS intake_id
        ), page AS MATERIALIZED (
          SELECT id FROM copyright_notice_email_thread_references
          WHERE copyright_notice_email_intake_id = (SELECT intake_id FROM owner)
          ORDER BY id LIMIT ${batchSize}
        )
        SELECT page.id FROM page`)
      : { rows: [] }
  const proof = await checkCopyrightThreadProofPage(
    transaction,
    noticeId,
    now,
    batchSize,
    upperBound,
    cursor,
  )
  if (!proof) {
    await transaction.commit()
    return { scanned: 1, deleted: 0, hasMore: true }
  }
  const { rows: admissions } = await transaction<{
    proof_is_current: boolean
    is_eligible: boolean
  }>(
    copyrightOperationalThreadAdmissionSql(cutoff, noticeId, {
      blockerGeneration: proof.blocker.generation,
    }),
  )
  if (!admissions[0]?.proof_is_current) {
    // Keep this case selected; the next page observes changed generations and restarts proof.
    await transaction.commit()
    return { scanned: 1, deleted: 0, hasMore: true }
  }
  if (!admissions[0]?.is_eligible) {
    // The next fixed sweep rechecks this case if the blocker later clears.
    await advanceCopyrightThreadCaseCursor(transaction, noticeId, upperBound)
    await transaction.commit()
    return { scanned: 1, deleted: 0, hasMore: true }
  }
  // Retirement and its destructive page commit together. Evidence admission checks this
  // existing retirement fact before adding references, edges or thread links.
  // ast-grep-ignore: no-three-sequential-awaits -- persist the retirement cutoff before deleting thread evidence so replay is fenced; save the cursor from the completed delete page progress
  await transaction(sql`/* retireCopyrightCaseThread */
    INSERT INTO copyright_notice_email_thread_retirements
      (copyright_notice_id, retired_before_intake_bound)
    VALUES (${noticeId}, ${cutoffId}::uuid)
    ON CONFLICT (copyright_notice_id) DO UPDATE SET
      retired_before_intake_bound = GREATEST(
        copyright_notice_email_thread_retirements.retired_before_intake_bound,
        EXCLUDED.retired_before_intake_bound)`)
  const result = await deleteCaseThreadPage(
    transaction,
    now,
    noticeId,
    link.copyright_notice_email_intake_id,
    phase,
    cursor.cursor_edge_id,
    batchSize,
    references.map(row => row.id),
    link.matched_token_id,
  )
  await transaction(sql`/* advanceCopyrightThreadRetentionCursor */
    UPDATE copyright_notice_operational_retention_cursors
    SET cursor_child_id = ${result.phase === null ? link.id : cursor.cursor_child_id}::uuid,
      cursor_edge_id = ${result.edgeCursor}::uuid,
      cursor_phase = ${result.phase},
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
    let page: PageResult
    try {
      // oxlint-disable-next-line no-await-in-loop -- each transaction advances the durable keyset.
      page = await sweepPage(now, cutoff, cutoffId, options.batchSize) // no-mistakes-disable-line query-reached-per-item: each fixed-budget transaction commits its durable cursor before the next page.
    } catch (err) {
      if (!isCopyrightEmailTokenGcConflict(err)) throw err
      return { scanned, deleted, hasMore: false }
    }
    scanned += page.scanned
    deleted += page.deleted
    hasMore = page.hasMore
    if (!hasMore) break
  }
  return { scanned, deleted, hasMore }
}
