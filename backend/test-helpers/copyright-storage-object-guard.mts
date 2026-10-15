import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Attempts an artifact insert that retains metadata but omits its stored original. */
export async function insertCopyrightArtifactWithoutStorageObject(noticeId: string): Promise<void> {
  await write(sql`/* insertCopyrightArtifactWithoutStorageObject */
    INSERT INTO copyright_notice_evidence_artifacts (
      copyright_notice_submission_id, storage_object_id, sha256, media_type_id, byte_size
    )
    SELECT copyright_notice_submission_id, NULL, sha256, media_type_id, byte_size
    FROM copyright_notice_evidence_artifacts
    WHERE copyright_notice_id = ${noticeId}
    LIMIT 1`)
}

/** Attempts a distinct SES intake whose original MIME bytes have no object identity. */
export async function insertCopyrightIntakeWithoutStorageObject(intakeId: string): Promise<void> {
  await write(sql`/* insertCopyrightIntakeWithoutStorageObject */
    INSERT INTO copyright_notice_email_intakes (
      amazon_ses_message_id, received_at, raw_storage_object_id, raw_sha256, raw_media_type_id,
      raw_byte_size, spf_verdict, dkim_verdict, dmarc_verdict, spam_verdict, virus_verdict
    )
    SELECT ${`missing-storage-${randomUUID()}`}, received_at, NULL, raw_sha256, raw_media_type_id,
      raw_byte_size, spf_verdict, dkim_verdict, dmarc_verdict, spam_verdict, virus_verdict
    FROM copyright_notice_email_intakes WHERE id = ${intakeId}`)
}
