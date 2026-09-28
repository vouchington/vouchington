import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { loadRetentionFacts } from './retention-preview.mts'

export type RetentionDisposition = {
  id: string
  previewId: string
  outcome: 'refused' | 'not_destroyed'
}

/** Records an audited non-destructive outcome. Object storage is never called. */
export async function recordCopyrightEvidenceRetentionDisposition(
  previewId: string,
): Promise<RetentionDisposition> {
  await using transaction = await beginTransaction()
  const preview = await transaction<{
    id: string
    copyright_notice_id: string
    disposition_id: string | null
    outcome: 'refused' | 'not_destroyed' | null
  }>(sql`/* recordCopyrightEvidenceRetentionDisposition */
    SELECT preview.id, preview.copyright_notice_id, disposition.id AS disposition_id, disposition.outcome
    FROM copyright_evidence_retention_previews preview
    LEFT JOIN copyright_evidence_retention_dispositions disposition
      ON disposition.copyright_evidence_retention_preview_id = preview.id
    WHERE preview.id = ${previewId}
    FOR UPDATE OF preview
  `)
  const row = preview.rows[0]
  assert(row, 404, 'Copyright evidence retention preview was not found')
  if (row.disposition_id && row.outcome) {
    await transaction.commit()
    return { id: row.disposition_id, previewId, outcome: row.outcome }
  }
  const facts = await loadRetentionFacts(transaction, row.copyright_notice_id)
  const outcome = facts.reasons.length === 0 ? 'not_destroyed' : 'refused'
  const inserted = await transaction<{
    id: string
  }>(sql`/* recordCopyrightEvidenceRetentionDisposition */
    INSERT INTO copyright_evidence_retention_dispositions (
      copyright_evidence_retention_preview_id, attempted_at, outcome
    ) VALUES (${previewId}, CURRENT_TIMESTAMP, ${outcome})
    RETURNING id
  `)
  const dispositionId = inserted.rows[0]!.id
  await transaction(sql`/* recordCopyrightEvidenceRetentionDisposition */
    INSERT INTO copyright_evidence_retention_disposition_artifacts (
      copyright_evidence_retention_disposition_id, copyright_notice_evidence_artifact_id, outcome
    )
    SELECT ${dispositionId}, artifact_id, ${outcome}
    FROM unnest(${facts.evidenceArtifactIds}::uuid[]) AS artifact_id
  `)
  await transaction(sql`/* recordCopyrightEvidenceRetentionDisposition */
    INSERT INTO copyright_evidence_retention_disposition_email_intakes (
      copyright_evidence_retention_disposition_id, copyright_notice_email_intake_id, outcome
    )
    SELECT ${dispositionId}, intake_id, ${outcome}
    FROM unnest(${facts.emailIntakeIds}::uuid[]) AS intake_id
  `)
  await transaction.commit()
  return { id: dispositionId, previewId, outcome }
}
