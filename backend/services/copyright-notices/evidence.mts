import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { CopyrightEvidenceArtifactRecord } from './types.mts'

/** Preserves a received original or attachment; bytes remain in private object storage. */
export async function appendCopyrightEvidenceArtifact(input: {
  submissionId: string
  storageKey: string
  sha256: Buffer
  mimeType: string
  byteSize: number
}): Promise<CopyrightEvidenceArtifactRecord> {
  assert(input.sha256.length === 32, 422, 'Evidence SHA-256 must be 32 bytes')
  assert(Number.isSafeInteger(input.byteSize) && input.byteSize >= 0, 422, 'Invalid evidence size')
  await using transaction = await beginTransaction()
  const { rows: submissions } = await transaction<{ copyright_notice_id: string }>(
    sql`/* appendCopyrightEvidenceArtifact:lockSubmission */
    SELECT submission.copyright_notice_id
    FROM copyright_notice_submissions submission
    JOIN copyright_notices notice ON notice.id = submission.copyright_notice_id
    WHERE submission.id = ${input.submissionId}
    FOR UPDATE OF notice, submission
  `,
  )
  const submission = submissions[0]
  assert(submission, 404, 'Copyright submission not found')
  const { rows } = await transaction<CopyrightEvidenceArtifactRecord>(
    sql`/* appendCopyrightEvidenceArtifact */
    INSERT INTO copyright_notice_evidence_artifacts (
      copyright_notice_submission_id, storage_key, sha256, mime_type, byte_size
    ) VALUES (
      ${input.submissionId}, ${input.storageKey}, ${input.sha256}, ${input.mimeType}, ${input.byteSize}
    )
    ON CONFLICT (copyright_notice_submission_id, storage_key) DO NOTHING
    RETURNING id, copyright_notice_submission_id, storage_key, sha256, mime_type, byte_size
  `,
  )
  const artifact = rows[0]
  assert(artifact, 409, 'Evidence storage key is already recorded for this submission')
  await transaction(sql`/* appendCopyrightEvidenceArtifact:event */
    INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, metadata)
    VALUES (${submission.copyright_notice_id}, 'evidence_artifact_recorded',
      ${JSON.stringify({ artifactId: artifact.id })}::jsonb)
  `)
  await transaction.commit()
  return artifact
}
