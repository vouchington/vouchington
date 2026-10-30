import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { COPYRIGHT_ERASED_KEY_PREFIX } from './retention-erasure-spec.mts'
import { openCopyrightSecrets } from './encryption-keys.mts'
import {
  decryptAgentIntake,
  type AttachmentCiphertexts,
  type ParseCiphertexts,
} from './email-intake-agent.mts'
import type { CopyrightEmailIntake, CopyrightEmailIntakeForAgent } from './email-intakes.mts'

export async function getCopyrightEmailIntakeForAgent(
  intakeId: string,
): Promise<CopyrightEmailIntakeForAgent | null> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<CopyrightEmailIntake & ParseCiphertexts>(
    sql`/* getCopyrightEmailIntakeForAgent */
      SELECT intake.id, intake.amazon_ses_message_id, intake.received_at,
        COALESCE(object.storage_key, ${COPYRIGHT_ERASED_KEY_PREFIX} || intake.id::text) AS raw_storage_key,
        intake.raw_storage_object_id, intake.raw_sha256, intake.raw_media_type_id,
        (SELECT mime_type FROM media_types WHERE id = intake.raw_media_type_id) AS raw_mime_type, intake.raw_byte_size,
        parse.sender_email_ciphertext, parse.sender_name_ciphertext,
        parse.subject_ciphertext, parse.body_ciphertext
      FROM copyright_notice_email_intakes intake
      JOIN copyright_notice_email_intake_receipts receipt
        ON receipt.id = intake.id AND receipt.erased_at IS NULL
      LEFT JOIN copyright_notice_storage_objects object ON object.id = intake.raw_storage_object_id
      JOIN copyright_notice_email_intake_parses parse
        ON parse.copyright_notice_email_intake_id = intake.id AND parse.status = 'succeeded'
      WHERE intake.id = ${intakeId} AND intake.raw_storage_object_id IS NOT NULL LIMIT 1`,
  )
  const intake = rows[0]
  if (!intake) {
    await transaction.commit()
    return null
  }
  const { rows: attachments } = await transaction<AttachmentCiphertexts>(
    sql`/* getCopyrightEmailIntakeForAgent:attachments */
      SELECT filename_ciphertext, content_id_ciphertext,
        (SELECT mime_type FROM media_types WHERE id = media_type_id) AS mime_type, byte_size, sha256
      FROM copyright_notice_email_intake_attachments
      WHERE copyright_notice_email_intake_id = ${intake.id} ORDER BY ordinal`,
  )
  if (intake.body_ciphertext === 'erased') {
    await transaction.commit()
    return null
  }
  await using secrets = await openCopyrightSecrets({ kind: 'intake', id: intake.id }, transaction)
  const result = decryptAgentIntake(intake, attachments, secrets)
  await transaction.commit()
  return result
}
