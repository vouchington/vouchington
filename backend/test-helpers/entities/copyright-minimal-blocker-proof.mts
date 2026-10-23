import { v7 } from 'uuid'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function markMinimalProofCaseEvidenceErased(noticeId: string): Promise<void> {
  await write(sql`/* markBlockerProofCaseErased */
    INSERT INTO copyright_notice_retention_erasures
      (copyright_notice_id, retention_days, erased_object_count, legal_clock_at)
    VALUES (${noticeId}, 1095, 0,
      fn_project_copyright_minimal_record_legal_clock(${noticeId}))`)
}

export async function readMinimalProofFormAuthority(
  submissionId: string,
  screeningId: string,
  noticeId: string,
) {
  const { rows } = await read<{
    current_screening: boolean
    valid_target_found: boolean
    claimant_receipt_found: boolean
    compliant_form_assessment_found: boolean
  }>(sql`/* compareCopyrightMinimalFormAuthority */
    SELECT fn_current_copyright_form_screening(${submissionId}, ${screeningId}) AS current_screening,
      work.valid_target_found, work.claimant_receipt_found,
      work.compliant_form_assessment_found
    FROM copyright_notice_minimal_purge_work work
    WHERE work.copyright_notice_id = ${noticeId}`)
  return rows[0]
}

export async function seedQualifiedCourtHold(
  noticeId: string,
  moderatorId: string,
): Promise<string> {
  const { rows: submissions } = await write<{ id: string }>(sql`/* seedCourtHoldForMinimalProof */
    INSERT INTO copyright_notice_submissions
      (copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
    VALUES (${noticeId}, 'court_or_ccb_hold', '2026-10-23T00:00:00Z',
      'staff', 'encrypted-court-filing') RETURNING id`)
  const submissionId = submissions[0]?.id
  if (!submissionId) throw new Error('Court hold submission missing')
  const { rows: assessments } = await write<{ id: string }>(sql`
    /* qualifyCourtHoldForMinimalProof */
    INSERT INTO copyright_notice_legal_hold_assessments
      (copyright_notice_id, copyright_notice_submission_id, assessed_at,
       assessed_by_id, is_from_original_claimant, proceeding_kind,
       commenced_at, received_by_designated_agent_at, is_same_material,
       rationale_ciphertext)
    VALUES (${noticeId}, ${submissionId}, '2026-10-23T00:00:00Z',
      ${moderatorId}, true, 'federal_court',
      '2026-10-23T00:00:00Z', '2026-10-23T00:00:00Z', true,
      'encrypted-hold-assessment') RETURNING id`)
  const assessmentId = assessments[0]?.id
  if (!assessmentId) throw new Error('Court hold assessment missing')
  return assessmentId
}

export async function resolveQualifiedCourtHold(
  noticeId: string,
  assessmentId: string,
  moderatorId: string,
): Promise<void> {
  await write(sql`/* resolveCourtHoldForMinimalProof */
    INSERT INTO copyright_notice_legal_hold_resolutions
      (copyright_notice_id, copyright_notice_legal_hold_assessment_id,
       resolved_at, resolved_by_id, resolution_kind, rationale_ciphertext)
    VALUES (${noticeId}, ${assessmentId}, '2027-01-01T00:00:00Z',
      ${moderatorId}, 'proceeding_ended', 'encrypted-resolution')`)
}

export async function seedTerminalSubmissionPages(noticeId: string): Promise<void> {
  await write(sql`/* seedTerminalCopyrightSubmissionPages */
    INSERT INTO copyright_notice_submissions
      (copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
    SELECT ${noticeId}, 'supplement', '2026-10-23T00:00:00Z', 'staff',
      'encrypted-supplement' FROM generate_series(1, 25)`)
}

export async function readMinimalBlockerCursor(noticeId: string): Promise<{
  blocker_cursor: string | null
  blocker_phase_index: number
}> {
  const { rows } = await read<{ blocker_cursor: string | null; blocker_phase_index: number }>(sql`
    /* readCopyrightBlockerCursor */
    SELECT blocker_cursor, blocker_phase_index FROM copyright_notice_minimal_purge_work
    WHERE copyright_notice_id = ${noticeId}`)
  if (!rows[0]) throw new Error('Expected minimal purge work cursor')
  return rows[0]
}

export async function advanceUnrelatedAccountClock(): Promise<void> {
  const userId = v7()
  await write(sql`/* createUnrelatedCopyrightClockUser */
    INSERT INTO retained_user_identities (id) VALUES (${userId})`)
  await write(sql`/* advanceUnrelatedCopyrightClock */
    UPDATE retained_user_identities SET purged_at = '2029-10-23T00:00:00Z'
    WHERE id = ${userId}`)
}

export async function seedMinimalProofCorrespondenceFanout(noticeId: string): Promise<void> {
  await write(sql`/* seedCopyrightBlockerRaceFanout */
    INSERT INTO copyright_notice_correspondence_messages
      (copyright_notice_id, direction, composition_kind, correspondence_kind, body_ciphertext)
    SELECT ${noticeId}, 'outbound', 'deterministic_template', 'receipt', 'encrypted-body'
    FROM generate_series(1, 55)`)
}

export async function selectMinimalProofChildPhase(
  noticeId: string,
  phaseIndex: number,
): Promise<void> {
  await write(sql`/* selectCopyrightBlockerRaceChildPhase */
    UPDATE copyright_notice_minimal_purge_work SET phase_index = ${phaseIndex}
    WHERE copyright_notice_id = ${noticeId}`)
}

export async function admitLateCopyrightAppeal(noticeId: string): Promise<void> {
  await write(sql`/* admitLateCopyrightAppeal */
    INSERT INTO copyright_notice_submissions
      (copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
    VALUES (${noticeId}, 'appeal', '2026-10-23T00:00:00Z', 'staff',
      'encrypted-late-appeal')`)
}

export async function countMinimalProofCorrespondence(noticeId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`
    /* assertCopyrightMutationStoppedChildDrain */
    SELECT count(*)::integer AS count FROM copyright_notice_correspondence_messages
    WHERE copyright_notice_id = ${noticeId}`)
  return rows[0]?.count ?? 0
}

export async function copyrightCaseExists(noticeId: string): Promise<boolean> {
  const { rows } = await read(sql`/* assertCopyrightCaseSurvivesLateAppeal */
    SELECT id FROM copyright_notices WHERE id = ${noticeId}`)
  return rows.length === 1
}
