import type { beginTransaction } from '@data-stores/psql'
import { upsertMediaTypeIds } from '@services/urls/media-types'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import type { CopyrightEmailAttachmentInput } from './email-intakes.mts'

export async function insertCopyrightEmailAttachments(
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
  intakeId: string,
  attachments: CopyrightEmailAttachmentInput[],
  purpose: string,
): Promise<void> {
  const mediaTypeIds = await upsertMediaTypeIds(
    attachments.map(attachment => attachment.mimeType),
    { query: transaction },
  )
  const rows = JSON.stringify(
    attachments.map((attachment, ordinal) => ({
      ordinal,
      filename_ciphertext: attachment.filename ? encryptSecret(attachment.filename, purpose) : null,
      content_id_ciphertext: attachment.contentId
        ? encryptSecret(attachment.contentId, purpose)
        : null,
      media_type_id: mediaTypeIds.get(attachment.mimeType.trim().toLowerCase()),
      byte_size: attachment.byteSize,
      sha256: attachment.sha256.toString('hex'),
    })),
  )
  await transaction(sql`/* recordCopyrightEmailParse:attachments */
    INSERT INTO copyright_notice_email_intake_attachments (
      copyright_notice_email_intake_id, ordinal, filename_ciphertext, content_id_ciphertext,
      media_type_id, byte_size, sha256
    ) SELECT ${intakeId}, attachment.ordinal, attachment.filename_ciphertext,
      attachment.content_id_ciphertext, attachment.media_type_id, attachment.byte_size,
      decode(attachment.sha256, 'hex')
    FROM jsonb_to_recordset(${rows}::jsonb) AS attachment(
      ordinal integer, filename_ciphertext text, content_id_ciphertext text, media_type_id bigint,
      byte_size integer, sha256 text
    )
  `)
}
