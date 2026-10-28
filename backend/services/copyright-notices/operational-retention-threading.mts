import { beginTransaction } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import { copyrightOperationalThreadEligibleSql } from './operational-retention-thread-eligibility.mts'
import { lockCopyrightEmailThreadTokens } from './email-thread-ancestors.mts'
import {
  lockCopyrightOperationalThreadCase,
  lockCopyrightThreadPreservationGate,
} from './operational-retention-thread-lock.mts'
import { deleteCaseThreadPage, type ThreadPhase } from './operational-retention-thread-page.mts'
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
  await using transaction = await beginTransaction()
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
      cursor_legal_phase, cursor_legal_child_id, cursor_legal_hold_generation,
      cursor_case_party_generation, cursor_legal_latest_release_at,
      cursor_blocker_phase, cursor_blocker_child_id, cursor_blocker_assessment_id,
      cursor_blocker_territorial_decision_id, cursor_blocker_generation,
      cursor_blocker_found_qualifying_assessment, cursor_blocker_found_screening_target,
      cursor_blocker_found_claimant_receipt
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
    matched_lookup_digest: string | null
  }>(sql`/* scanCopyrightThreadCaseLink */
    SELECT link.id, link.copyright_notice_email_intake_id, link.matched_token_id,
      token.lookup_digest AS matched_lookup_digest
    FROM copyright_notice_email_intake_notice_links link
    LEFT JOIN copyright_notice_email_thread_tokens token ON token.id = link.matched_token_id
    WHERE link.copyright_notice_id = ${noticeId}
      AND link.id > COALESCE(${cursor.cursor_child_id}::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid)
    ORDER BY link.id LIMIT 1`)
  const link = links[0]
  if (!link) {
    await advanceCopyrightThreadCaseCursor(transaction, noticeId, upperBound)
    await transaction.commit()
    return { scanned: 1, deleted: 0, hasMore: true }
  }

  const phase = cursor.cursor_phase ?? 'references'
  const { rows: references } =
    phase === 'references'
      ? await transaction<{ id: string; lookup_digest: string | null }>(sql`
        /* scanCopyrightThreadIntakeReferences */
        WITH page AS MATERIALIZED (
          SELECT id, token_id FROM copyright_notice_email_thread_references
          WHERE copyright_notice_email_intake_id = ${link.copyright_notice_email_intake_id}
          ORDER BY id LIMIT ${batchSize}
        )
        SELECT page.id, token.lookup_digest FROM page
        LEFT JOIN copyright_notice_email_thread_tokens token ON token.id = page.token_id`)
      : { rows: [] }
  // Token, case replay, then legal party locks match the ingestion order.
  // ast-grep-ignore: no-three-sequential-awaits -- digest, case, and preservation locks have a required global order before eligibility can be read.
  await lockCopyrightEmailThreadTokens(transaction, [
    ...references.flatMap(row => (row.lookup_digest ? [row.lookup_digest] : [])),
    ...(link.matched_lookup_digest ? [link.matched_lookup_digest] : []),
  ])
  await lockCopyrightOperationalThreadCase(transaction, noticeId)
  await lockCopyrightThreadPreservationGate(transaction, noticeId)
  // Thread writers advance this projection in their own transaction. Hold its row until
  // deletion commits so a late review, link, reference or edge cannot pass the recheck.
  const { rows: activityRows } = await transaction<{ copyright_notice_id: string }>(sql`
    /* lockCopyrightThreadRetentionActivity */
    SELECT copyright_notice_id FROM copyright_notice_thread_retention_activity
    WHERE copyright_notice_id = ${noticeId} FOR UPDATE`)
  const proof = await checkCopyrightThreadProofPage(
    transaction,
    noticeId,
    now,
    cutoff,
    batchSize,
    upperBound,
    cursor,
  )
  if (!proof) {
    await transaction.commit()
    return { scanned: 1, deleted: 0, hasMore: true }
  }
  const { rows: eligible } = await transaction<{ id: string }>(
    copyrightOperationalThreadEligibleSql(cutoff, noticeId),
  )
  if (eligible.length === 0 || activityRows.length === 0) {
    // The next fixed sweep rechecks this case if the blocker later clears.
    await advanceCopyrightThreadCaseCursor(transaction, noticeId, upperBound)
    await transaction.commit()
    return { scanned: 1, deleted: 0, hasMore: true }
  }
  // The marker and first irreversible delete commit together. Old-source replay cannot
  // recreate a removed reference between pages; a fresh source remains admissible.
  // ast-grep-ignore: no-three-sequential-awaits -- the replay fence must precede bounded child deletion, then its cursor must record committed progress.
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
    // oxlint-disable-next-line no-await-in-loop -- each transaction advances the durable keyset.
    const page = await sweepPage(now, cutoff, cutoffId, options.batchSize) // no-mistakes-disable-line query-reached-per-item: each fixed-budget transaction commits its durable cursor before the next page.
    scanned += page.scanned
    deleted += page.deleted
    hasMore = page.hasMore
    if (!hasMore) break
  }
  return { scanned, deleted, hasMore }
}
