import { upsertMediaTypes } from '../../../services/urls/media-types.mts'
import { randomBytes, randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createCopyrightNoticeSchemaFixture } from './copyright-notice-schema.mts'

export async function rejectCrossNoticeSubmissionTarget(): Promise<void> {
  const owningNotice = await createCopyrightNoticeSchemaFixture()
  const otherNotice = await createCopyrightNoticeSchemaFixture()
  await write(sql`/* rejectCrossNoticeSubmissionTarget */
    INSERT INTO copyright_notice_submission_targets (
      copyright_notice_submission_id, copyright_notice_target_id
    ) VALUES (${owningNotice.submissionId}, ${otherNotice.targetId})`)
}

export async function rejectCopyrightEvidenceMissingParent(): Promise<void> {
  const mediaTypeId = await upsertMediaTypes('application/pdf')
  await write(sql`/* rejectCopyrightEvidenceMissingParent */
    INSERT INTO copyright_notice_evidence_artifacts (
      copyright_notice_submission_id, storage_key, sha256, media_type_id, byte_size
    ) VALUES (uuidv7(), ${`missing-parent-${randomUUID()}`}, ${randomBytes(32)}, ${mediaTypeId}, 1)`)
}
