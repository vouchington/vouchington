import { v7 } from 'uuid'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { PrivateUser } from '../../services/users/types.mts'
import { appendTestCopyrightNoticeSubmission } from '../copyright-notice-submissions.mts'
import { appendCopyrightLegalHoldAssessment } from '../../services/copyright-notices/holds.mts'
import { resolveCopyrightLegalHold } from '../../services/copyright-notices/hold-resolution.mts'

export async function readMinimalProofFormAuthority(
  submissionId: string,
  screeningId: string,
  noticeId: string,
) {
  const { rows } = await read<{
    current_screening: boolean
    has_valid_target: boolean
    has_claimant_receipt: boolean
    has_compliant_form_assessment: boolean
  }>(sql`/* compareCopyrightMinimalFormAuthority */
    SELECT fn_current_copyright_form_screening(${submissionId}, ${screeningId}) AS current_screening,
      work.has_valid_target, work.has_claimant_receipt,
      work.has_compliant_form_assessment
    FROM copyright_notice_minimal_purge_continuations work
    WHERE work.copyright_notice_identity_id = ${noticeId}`)
  return rows[0]
}

export async function seedQualifiedCourtHold(
  noticeId: string,
  moderator: PrivateUser,
  targetId: string,
): Promise<string> {
  const submission = await appendTestCopyrightNoticeSubmission({
    noticeId,
    kind: 'court_or_ccb_hold',
    receivedAt: new Date(),
    sourceKind: 'staff',
    submittedByUserId: moderator.id,
    bodyCiphertext: 'test hold submission',
  })
  const assessment = await appendCopyrightLegalHoldAssessment({
    currentUser: moderator,
    submissionId: submission.id,
    assessedAt: new Date(),
    fromOriginalClaimant: true,
    proceedingKind: 'federal_court',
    ccbClaimKind: null,
    commencedAt: new Date(),
    receivedByDesignatedAgentAt: new Date(),
    sameMaterial: true,
    targetIds: [targetId],
    rationale: 'Verified qualifying federal court filing.',
    dependencies: {
      assertLegalEnforcementEnabled: () => {},
      publishPlacement: async () => {},
    },
  })
  return assessment.id
}

export async function resolveQualifiedCourtHold(
  assessmentId: string,
  moderator: PrivateUser,
): Promise<void> {
  await resolveCopyrightLegalHold({
    currentUser: moderator,
    assessmentId,
    resolvedAt: new Date(),
    resolutionKind: 'proceeding_ended',
    rationale: 'The proceeding ended.',
  })
}

export async function seedTerminalSubmissionPages(noticeId: string): Promise<void> {
  const receivedAt = new Date()
  await write(sql`/* seedTerminalCopyrightSubmissionPages */
    INSERT INTO copyright_notice_submissions
      (copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
    SELECT ${noticeId}, 'supplement', ${receivedAt}, 'staff',
      'encrypted-supplement' FROM generate_series(1, 101)`)
}

export async function readMinimalBlockerCursor(noticeId: string): Promise<{
  blocker_cursor: string | null
  blocker_phase_index: number
}> {
  const { rows } = await read<{ blocker_cursor: string | null; blocker_phase_index: number }>(sql`
    /* readCopyrightBlockerCursor */
    SELECT blocker_cursor, blocker_phase_index FROM copyright_notice_minimal_purge_continuations
    WHERE copyright_notice_identity_id = ${noticeId}`)
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
    UPDATE copyright_notice_minimal_purge_continuations SET phase_index = ${phaseIndex}
    WHERE copyright_notice_identity_id = ${noticeId}`)
}

export async function admitLateCopyrightAppeal(noticeId: string): Promise<void> {
  await appendTestCopyrightNoticeSubmission({
    noticeId,
    kind: 'appeal',
    receivedAt: new Date(),
    sourceKind: 'staff',
    submittedByUserId: null,
    bodyCiphertext: 'late appeal after erasure',
  })
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
