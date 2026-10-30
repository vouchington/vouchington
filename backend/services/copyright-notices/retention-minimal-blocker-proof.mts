import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { COPYRIGHT_MINIMAL_BLOCKER_PHASES } from './retention-minimal-blocker-phases.mts'
import type { CopyrightMinimalBlockerPage } from './retention-minimal-blocker-phase-types.mts'

type BlockerWork = {
  blocker_phase_index: number
  blocker_cursor: string | null
  blocker_generation: string | null
  blocker_transparency_generation: string | null
  blocker_complaint_window_months: number | null
  is_blocker_scan_complete: boolean
  has_blocker: boolean
}

type BlockerOutcome = 'progress' | 'ready' | 'ineligible'

/** A case page selects raw indexed IDs before any blocker joins or predicates. */
export async function advanceCopyrightMinimalBlockerProof(
  query: TransactionQuery,
  noticeId: string,
  proofGeneration: string,
  pageSize: number,
  now: Date,
  complaintMonths: number,
): Promise<BlockerOutcome> {
  const { rows: generations } = await query<{
    transparency_generation: string
  }>(sql`/* readCopyrightRetentionReportGeneration */
    SELECT transparency_generation FROM copyright_legal_mutation_sequence_states WHERE is_singleton`)
  const reportGeneration = generations[0]?.transparency_generation
  if (reportGeneration === undefined) throw new Error('Copyright report generation is missing')
  const { rows } = await query<BlockerWork>(sql`/* readCopyrightMinimalBlockerProof */
    SELECT blocker_phase_index, blocker_cursor, blocker_generation, blocker_transparency_generation, blocker_complaint_window_months,
      is_blocker_scan_complete, has_blocker
    FROM copyright_notice_minimal_purge_continuations
    WHERE copyright_notice_identity_id = ${noticeId} FOR UPDATE`)
  const work = rows[0]
  if (!work) return 'ineligible'
  if (
    work.blocker_generation === proofGeneration &&
    work.blocker_complaint_window_months === complaintMonths &&
    work.is_blocker_scan_complete &&
    !work.has_blocker &&
    work.blocker_transparency_generation !== reportGeneration
  ) {
    // Reports append immutable coverage. An unrelated compilation cannot revoke a complete
    // positive proof or restart its physical drain; source mutations still change case generation.
    await query(sql`/* refreshPositiveCopyrightReportProof */
      UPDATE copyright_notice_minimal_purge_continuations
      SET blocker_transparency_generation = ${reportGeneration}::bigint
      WHERE copyright_notice_identity_id = ${noticeId}`)
    return 'ready'
  }
  if (
    work.blocker_generation !== proofGeneration ||
    work.blocker_transparency_generation !== reportGeneration ||
    work.blocker_complaint_window_months !== complaintMonths ||
    work.has_blocker
  ) {
    await query(sql`/* restartCopyrightMinimalBlockerProof */
      UPDATE copyright_notice_minimal_purge_continuations
      SET blocker_generation = ${proofGeneration}::bigint,
        blocker_transparency_generation = ${reportGeneration}::bigint,
        blocker_complaint_window_months = ${complaintMonths},
        blocker_phase_index = 0, blocker_cursor = NULL,
        is_blocker_scan_complete = false, has_blocker = false,
        has_valid_target = false, has_unrestricted_target = false,
        has_claimant_receipt = false,
        has_compliant_notice_assessment = false,
        has_compliant_form_assessment = false,
        phase_index = 0, cursor_purge_record_id = NULL
      WHERE copyright_notice_identity_id = ${noticeId}`)
    // A negative checkpoint terminates this invocation, but is cleared for the next bounded
    // proof: passive complaint/deadline expiry need not write a new source generation.
    return work.has_blocker ? 'ineligible' : 'progress'
  }
  if (work.is_blocker_scan_complete) return 'ready'
  const phase = COPYRIGHT_MINIMAL_BLOCKER_PHASES[work.blocker_phase_index]
  if (phase) {
    const { rows: pages } = await query<CopyrightMinimalBlockerPage>(
      phase.statement(noticeId, work.blocker_cursor, pageSize, now, complaintMonths),
    )
    const page = pages[0]
    if (!page || page.scanned > pageSize + 1 || (page.scanned > 0 && !page.last_id))
      throw new Error(`Copyright blocker page failed for ${phase.table}`)
    const hasMore = page.scanned > pageSize
    await query(sql`/* checkpointCopyrightMinimalBlockerPage */
      UPDATE copyright_notice_minimal_purge_continuations
      SET blocker_phase_index = ${hasMore ? work.blocker_phase_index : work.blocker_phase_index + 1},
        blocker_cursor = ${hasMore ? page.last_id : null}::uuid,
        has_blocker = has_blocker OR ${page.blocked},
        has_valid_target = has_valid_target OR ${page.valid_target},
        has_unrestricted_target = has_unrestricted_target OR ${page.unrestricted_target},
        has_claimant_receipt = has_claimant_receipt OR ${page.claimant_receipt},
        has_compliant_notice_assessment = has_compliant_notice_assessment OR ${page.notice_assessment},
        has_compliant_form_assessment = has_compliant_form_assessment OR ${page.form_assessment}
      WHERE copyright_notice_identity_id = ${noticeId}`)
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
        JOIN copyright_notice_minimal_purge_continuations work
          ON work.copyright_notice_identity_id = intake.copyright_notice_id
        WHERE intake.copyright_notice_id = ${noticeId}
          AND NOT EXISTS (SELECT 1 FROM copyright_notice_form_intake_reviews review
            WHERE review.copyright_notice_form_intake_id = intake.id)
          AND (submission.source_kind = 'guest_form'
            OR NOT work.has_compliant_form_assessment))
      OR EXISTS (SELECT 1 FROM copyright_territorial_notice_receipts receipt
        WHERE receipt.copyright_notice_id = ${noticeId}
          AND NOT EXISTS (SELECT 1 FROM copyright_notices notice
            WHERE notice.id = receipt.copyright_notice_id AND notice.jurisdiction = receipt.jurisdiction
              AND notice.current_territorial_decision_identity_id IS NOT NULL))
      OR EXISTS (SELECT 1 FROM copyright_notice_minimal_purge_continuations work
        WHERE work.copyright_notice_identity_id = ${noticeId}
          AND work.has_compliant_notice_assessment
          AND work.has_unrestricted_target) AS blocked`)
  const blocked = finalFacts[0]?.blocked
  if (blocked === undefined)
    throw new Error('Copyright finite blocker proof did not return a result')
  await query(sql`/* finishCopyrightMinimalBlockerProof */
    UPDATE copyright_notice_minimal_purge_continuations
    SET is_blocker_scan_complete = true, has_blocker = ${blocked}
    WHERE copyright_notice_identity_id = ${noticeId}`)
  return 'progress'
}
