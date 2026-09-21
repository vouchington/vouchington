import { decryptSecret } from '@modules/token-secrets'
import {
  copyrightEmailIntakePurpose,
  type CopyrightEmailIntake,
  type CopyrightEmailIntakeForAgent,
} from './email-intakes.mts'

export type ParseCiphertexts = {
  sender_email_ciphertext: string
  sender_name_ciphertext: string | null
  subject_ciphertext: string
  body_ciphertext: string
}
export type AttachmentCiphertexts = {
  filename_ciphertext: string | null
  content_id_ciphertext: string | null
  mime_type: string
  byte_size: number
  sha256: Buffer
}

export function decryptAgentIntake(
  intake: CopyrightEmailIntake & ParseCiphertexts,
  attachments: AttachmentCiphertexts[],
): CopyrightEmailIntakeForAgent {
  const purpose = copyrightEmailIntakePurpose(intake.ses_message_id)
  return {
    id: intake.id,
    ses_message_id: intake.ses_message_id,
    received_at: intake.received_at,
    raw_storage_key: intake.raw_storage_key,
    raw_sha256: intake.raw_sha256,
    raw_mime_type: intake.raw_mime_type,
    raw_byte_size: intake.raw_byte_size,
    senderEmail: decryptSecret(intake.sender_email_ciphertext, purpose),
    senderName: intake.sender_name_ciphertext
      ? decryptSecret(intake.sender_name_ciphertext, purpose)
      : null,
    subject: decryptSecret(intake.subject_ciphertext, purpose),
    bodyText: decryptSecret(intake.body_ciphertext, purpose),
    attachments: attachments.map(attachment => ({
      filename: attachment.filename_ciphertext
        ? decryptSecret(attachment.filename_ciphertext, purpose)
        : null,
      contentId: attachment.content_id_ciphertext
        ? decryptSecret(attachment.content_id_ciphertext, purpose)
        : null,
      mimeType: attachment.mime_type,
      byteSize: attachment.byte_size,
      sha256: attachment.sha256,
    })),
  }
}
