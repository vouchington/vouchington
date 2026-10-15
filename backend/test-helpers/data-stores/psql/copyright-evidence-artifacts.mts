import { upsertMediaTypes } from '../../../services/urls/media-types.mts'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { upsertCopyrightStorageObjectId } from '../../../services/copyright-notices/storage-objects.mts'

/** Records a stored original for a submission; bytes stay in private object storage. */
export async function insertCopyrightEvidenceArtifact(input: {
  submissionId: string
  storageKey: string
  sha256: Buffer
  mimeType: string
  byteSize: number
}): Promise<string> {
  const mediaTypeId = await upsertMediaTypes(input.mimeType)
  await using transaction = await beginTransaction()
  const objectId = await upsertCopyrightStorageObjectId(input.storageKey, transaction)
  const { rows } = await transaction<{ id: string }>(sql`/* insertCopyrightEvidenceArtifact */
    INSERT INTO copyright_notice_evidence_artifacts (
      copyright_notice_submission_id, storage_object_id, sha256, media_type_id, byte_size
    ) VALUES (
      ${input.submissionId}, ${objectId}, ${input.sha256}, ${mediaTypeId}, ${input.byteSize}
    )
    RETURNING id`)
  await transaction.commit()
  if (!rows[0]) throw new Error('Copyright evidence artifact was not inserted')
  return rows[0].id
}
