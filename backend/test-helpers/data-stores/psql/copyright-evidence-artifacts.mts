import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Records a stored original for a submission; bytes stay in private object storage. */
export async function insertCopyrightEvidenceArtifact(input: {
  submissionId: string
  storageKey: string
  sha256: Buffer
  mimeType: string
  byteSize: number
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* insertCopyrightEvidenceArtifact */
    INSERT INTO copyright_notice_evidence_artifacts (
      copyright_notice_submission_id, storage_key, sha256, mime_type, byte_size
    ) VALUES (
      ${input.submissionId}, ${input.storageKey}, ${input.sha256}, ${input.mimeType}, ${input.byteSize}
    )
    RETURNING id`)
  if (!rows[0]) throw new Error('Copyright evidence artifact was not inserted')
  return rows[0].id
}
