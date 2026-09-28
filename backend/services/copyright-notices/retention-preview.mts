import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

export const retentionBlockReasons = [
  'gate_disabled',
  'policy_unapproved',
  'case_open',
  'legal_hold',
  'open_deadline',
] as const

export type RetentionBlockReason = (typeof retentionBlockReasons)[number]

export type RetentionPreview = {
  id: string
  noticeId: string
  eligible: boolean
  reasons: RetentionBlockReason[]
  evidenceArtifactIds: string[]
  emailIntakeIds: string[]
}

export async function previewCopyrightEvidenceRetention(
  noticeId: string,
): Promise<RetentionPreview> {
  await using transaction = await beginTransaction()
  const facts = await loadRetentionFacts(transaction, noticeId)
  const { rows } = await transaction<{ id: string }>(sql`/* previewCopyrightEvidenceRetention */
    WITH inserted AS (
      INSERT INTO copyright_evidence_retention_previews (
        copyright_notice_id, copyright_evidence_retention_policy_id, eligible
      ) VALUES (
        ${noticeId}, ${facts.policyId}, ${facts.reasons.length === 0}
      )
      RETURNING id
    ),
    blocks AS (
      INSERT INTO copyright_evidence_retention_preview_blocks (
        copyright_evidence_retention_preview_id, reason
      )
      SELECT inserted.id, reason
      FROM inserted
      CROSS JOIN unnest(${facts.reasons}::text[]) AS reason
      RETURNING copyright_evidence_retention_preview_id
    ),
    artifacts AS (
      INSERT INTO copyright_evidence_retention_preview_artifacts (
        copyright_evidence_retention_preview_id, copyright_notice_evidence_artifact_id
      )
      SELECT inserted.id, artifact_id
      FROM inserted
      CROSS JOIN unnest(${facts.evidenceArtifactIds}::uuid[]) AS artifact_id
      RETURNING copyright_evidence_retention_preview_id
    ),
    intakes AS (
      INSERT INTO copyright_evidence_retention_preview_email_intakes (
        copyright_evidence_retention_preview_id, copyright_notice_email_intake_id
      )
      SELECT inserted.id, intake_id
      FROM inserted
      CROSS JOIN unnest(${facts.emailIntakeIds}::uuid[]) AS intake_id
      RETURNING copyright_evidence_retention_preview_id
    )
    SELECT inserted.id
    FROM inserted
    CROSS JOIN (SELECT count(*) FROM blocks) block_count
    CROSS JOIN (SELECT count(*) FROM artifacts) artifact_count
    CROSS JOIN (SELECT count(*) FROM intakes) intake_count
  `)
  const previewId = rows[0]!.id
  await transaction.commit()
  return {
    id: previewId,
    noticeId,
    eligible: facts.reasons.length === 0,
    reasons: facts.reasons,
    evidenceArtifactIds: facts.evidenceArtifactIds,
    emailIntakeIds: facts.emailIntakeIds,
  }
}

export async function loadRetentionFacts(
  transaction: OwnedTransaction,
  noticeId: string,
): Promise<Omit<RetentionPreview, 'id' | 'noticeId' | 'eligible'> & { policyId: string | null }> {
  const { rows } = await transaction<{
    enabled: boolean
    policy_id: string | null
    closed: boolean
    held: boolean
    deadline_open: boolean
  }>(sql`/* loadRetentionFacts */
    SELECT
      gate.enabled,
      policy.id AS policy_id,
      closure.copyright_notice_id IS NOT NULL AS closed,
      EXISTS (
        SELECT 1
        FROM copyright_notice_legal_hold_assessments hold
        JOIN copyright_notice_submissions submission ON submission.id = hold.copyright_notice_submission_id
        WHERE submission.copyright_notice_id = notice.id
          AND NOT EXISTS (
            SELECT 1 FROM copyright_notice_legal_hold_resolutions resolution
            WHERE resolution.copyright_notice_legal_hold_assessment_id = hold.id
          )
      ) AS held,
      EXISTS (
        SELECT 1 FROM copyright_notice_deadlines deadline
        WHERE deadline.copyright_notice_id = notice.id
          AND deadline.resolved_at IS NULL
          AND deadline.cancelled_at IS NULL
      ) AS deadline_open
    FROM copyright_notices notice
    CROSS JOIN copyright_evidence_retention_gates gate
    LEFT JOIN copyright_notice_closures closure ON closure.copyright_notice_id = notice.id
    LEFT JOIN LATERAL (
      SELECT id FROM copyright_evidence_retention_policies
      WHERE approved_at IS NOT NULL
      ORDER BY approved_at DESC
      LIMIT 1
    ) policy ON true
    WHERE notice.id = ${noticeId}
  `)
  const fact = rows[0]
  const reasons: RetentionBlockReason[] = []
  if (!fact?.enabled) reasons.push('gate_disabled')
  if (!fact?.policy_id) reasons.push('policy_unapproved')
  if (!fact?.closed) reasons.push('case_open')
  if (fact?.held) reasons.push('legal_hold')
  if (fact?.deadline_open) reasons.push('open_deadline')
  const artifacts = await transaction<{ id: string }>(sql`/* loadRetentionFacts */
    SELECT artifact.id
    FROM copyright_notice_evidence_artifacts artifact
    JOIN copyright_notice_submissions submission ON submission.id = artifact.copyright_notice_submission_id
    WHERE submission.copyright_notice_id = ${noticeId}
    ORDER BY artifact.id
  `)
  const intakes = await transaction<{ id: string }>(sql`/* loadRetentionFacts */
    SELECT intake.id
    FROM copyright_notice_email_intakes intake
    JOIN copyright_notice_email_intake_reviews review
      ON review.copyright_notice_email_intake_id = intake.id
    WHERE review.promoted_copyright_notice_id = ${noticeId}
    ORDER BY intake.id
  `)
  return {
    policyId: fact?.policy_id ?? null,
    reasons,
    evidenceArtifactIds: artifacts.rows.map(row => row.id),
    emailIntakeIds: intakes.rows.map(row => row.id),
  }
}
