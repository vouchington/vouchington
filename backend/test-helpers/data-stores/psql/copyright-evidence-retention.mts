import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function readCopyrightNoticeSubmissionId(noticeId: string): Promise<string> {
  const { rows } = await read<{ id: string }>(sql`/* readCopyrightNoticeSubmissionId */
    SELECT id FROM copyright_notice_submissions
    WHERE copyright_notice_id = ${noticeId} AND kind = 'notice'
    ORDER BY id
    LIMIT 1`)
  if (!rows[0]) throw new Error(`Copyright notice has no submission: ${noticeId}`)
  return rows[0].id
}

export async function insertUnresolvedCopyrightLegalHold(input: {
  submissionId: string
  assessedAt: Date
  assessedById: string
  rationaleCiphertext: string
}): Promise<void> {
  await write(sql`/* insertUnresolvedCopyrightLegalHold */
    INSERT INTO copyright_notice_legal_hold_assessments (
      copyright_notice_submission_id, assessed_at, assessed_by_id, from_original_claimant,
      same_material, rationale_ciphertext
    ) VALUES (
      ${input.submissionId}, ${input.assessedAt}, ${input.assessedById}, false, true,
      ${input.rationaleCiphertext}
    )`)
}

export async function readCopyrightEvidenceStorageKey(artifactId: string): Promise<string> {
  const { rows } = await read<{ storage_key: string }>(sql`/* readCopyrightEvidenceStorageKey */
    SELECT storage_key FROM copyright_notice_evidence_artifacts WHERE id = ${artifactId}`)
  if (!rows[0]) throw new Error(`Copyright evidence artifact not found: ${artifactId}`)
  return rows[0].storage_key
}

export async function setCopyrightEvidenceRetentionGate(enabled: boolean): Promise<void> {
  await write(sql`/* setCopyrightEvidenceRetentionGate */
    UPDATE copyright_evidence_retention_gates
    SET enabled = ${enabled}, updated_at = CURRENT_TIMESTAMP`)
}

export async function insertApprovedCopyrightEvidenceRetentionPolicy(input: {
  approvedAt: Date
  approvedByUserId: string
}): Promise<string> {
  const { rows } = await write<{
    id: string
  }>(sql`/* insertApprovedCopyrightEvidenceRetentionPolicy */
    INSERT INTO copyright_evidence_retention_policies (approved_at, approved_by_user_id)
    VALUES (${input.approvedAt}, ${input.approvedByUserId})
    RETURNING id`)
  if (!rows[0]) throw new Error('Copyright evidence retention policy was not inserted')
  return rows[0].id
}

export async function clearCopyrightEvidenceRetentionPolicy(policyId: string): Promise<void> {
  await write(sql`/* clearCopyrightEvidenceRetentionPolicy */
    UPDATE copyright_evidence_retention_policies
    SET approved_at = NULL, approved_by_user_id = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${policyId}`)
}
