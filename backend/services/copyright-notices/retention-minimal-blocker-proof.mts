import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { COPYRIGHT_MINIMAL_BLOCKER_PHASES } from './retention-minimal-blocker-phases.mts'
import type { CopyrightMinimalBlockerPage } from './retention-minimal-blocker-phase-types.mts'

type BlockerWork = {
  blocker_phase_index: number
  blocker_cursor: string | null
  blocker_generation: string | null
  blocker_scan_complete: boolean
  blocker_found: boolean
}

type BlockerOutcome = 'progress' | 'ready' | 'ineligible'

/** A case page selects raw indexed IDs before any blocker joins or predicates. */
export async function advanceCopyrightMinimalBlockerProof(
  query: TransactionQuery,
  noticeId: string,
  proofGeneration: string,
  pageSize: number,
): Promise<BlockerOutcome> {
  const { rows } = await query<BlockerWork>(sql`/* readCopyrightMinimalBlockerProof */
    SELECT blocker_phase_index, blocker_cursor, blocker_generation,
      blocker_scan_complete, blocker_found
    FROM copyright_notice_minimal_purge_work
    WHERE copyright_notice_id = ${noticeId} FOR UPDATE`)
  const work = rows[0]
  if (!work) return 'ineligible'
  if (work.blocker_generation !== proofGeneration) {
    await query(sql`/* restartCopyrightMinimalBlockerProof */
      UPDATE copyright_notice_minimal_purge_work
      SET blocker_generation = ${proofGeneration}::bigint,
        blocker_phase_index = 0, blocker_cursor = NULL,
        blocker_scan_complete = false, blocker_found = false,
        valid_target_found = false, unrestricted_target_found = false,
        claimant_receipt_found = false,
        compliant_notice_assessment_found = false,
        compliant_form_assessment_found = false,
        phase_index = 0
      WHERE copyright_notice_id = ${noticeId}`)
    return 'progress'
  }
  if (work.blocker_found) return 'ineligible'
  if (work.blocker_scan_complete) return 'ready'
  const phase = COPYRIGHT_MINIMAL_BLOCKER_PHASES[work.blocker_phase_index]
  if (phase) {
    const { rows: pages } = await query<CopyrightMinimalBlockerPage>(
      phase.statement(noticeId, work.blocker_cursor, pageSize),
    )
    const page = pages[0]
    if (!page || page.scanned > pageSize + 1 || (page.scanned > 0 && !page.last_id))
      throw new Error(`Copyright blocker page failed for ${phase.table}`)
    const hasMore = page.scanned > pageSize
    await query(sql`/* checkpointCopyrightMinimalBlockerPage */
      UPDATE copyright_notice_minimal_purge_work
      SET blocker_phase_index = ${hasMore ? work.blocker_phase_index : work.blocker_phase_index + 1},
        blocker_cursor = ${hasMore ? page.last_id : null}::uuid,
        blocker_found = blocker_found OR ${page.blocked},
        valid_target_found = valid_target_found OR ${page.valid_target},
        unrestricted_target_found = unrestricted_target_found OR ${page.unrestricted_target},
        claimant_receipt_found = claimant_receipt_found OR ${page.claimant_receipt},
        compliant_notice_assessment_found = compliant_notice_assessment_found OR ${page.notice_assessment},
        compliant_form_assessment_found = compliant_form_assessment_found OR ${page.form_assessment}
      WHERE copyright_notice_id = ${noticeId}`)
    return 'progress'
  }
  if (work.blocker_phase_index !== COPYRIGHT_MINIMAL_BLOCKER_PHASES.length)
    throw new Error('Copyright blocker phase is missing or invalid')
  const { rows: finalFacts } = await query<{ blocked: boolean }>(sql`
    /* finishCopyrightMinimalFiniteBlockerProof */
    SELECT
      EXISTS (SELECT 1 FROM copyright_notice_form_intakes intake
        JOIN copyright_notice_submissions submission
          ON submission.id = intake.copyright_notice_submission_id
        JOIN copyright_notice_minimal_purge_work work
          ON work.copyright_notice_id = intake.copyright_notice_id
        WHERE intake.copyright_notice_id = ${noticeId}
          AND NOT EXISTS (SELECT 1 FROM copyright_notice_form_intake_reviews review
            WHERE review.copyright_notice_form_intake_id = intake.id)
          AND (submission.source_kind = 'guest_form'
            OR NOT work.compliant_form_assessment_found))
      OR EXISTS (SELECT 1 FROM copyright_territorial_notice_receipts receipt
        WHERE receipt.copyright_notice_id = ${noticeId}
          AND NOT EXISTS (SELECT 1 FROM copyright_territorial_decisions decision
            WHERE decision.copyright_notice_id = receipt.copyright_notice_id
              AND decision.jurisdiction = receipt.jurisdiction))
      OR EXISTS (SELECT 1 FROM copyright_notice_minimal_purge_work work
        WHERE work.copyright_notice_id = ${noticeId}
          AND work.compliant_notice_assessment_found
          AND work.unrestricted_target_found) AS blocked`)
  const blocked = finalFacts[0]?.blocked
  if (blocked === undefined)
    throw new Error('Copyright finite blocker proof did not return a result')
  await query(sql`/* finishCopyrightMinimalBlockerProof */
    UPDATE copyright_notice_minimal_purge_work
    SET blocker_scan_complete = true, blocker_found = ${blocked}
    WHERE copyright_notice_id = ${noticeId}`)
  return 'progress'
}
