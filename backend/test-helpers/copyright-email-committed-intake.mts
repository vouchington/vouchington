import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { copyrightEmailIntakePurpose } from '../services/copyright-notices/email-intakes.mts'
import { buildCopyrightEmailThreadReferenceRows } from '../services/copyright-notices/email-thread-references.mts'
import { createUnparsedCopyrightEmailIntake } from './copyright-email-intake-fixtures.mts'

/** Commit an owned initial email and its thread facts before exercising a staff approval. */
export async function createCommittedCopyrightEmailIntake() {
  const intake = await createUnparsedCopyrightEmailIntake()
  const messageId = `<${randomUUID()}@example.test>`
  const purpose = copyrightEmailIntakePurpose(intake.amazon_ses_message_id)
  const [reference] = buildCopyrightEmailThreadReferenceRows({
    messageId,
    inReplyTo: [],
    references: [],
  })
  await using transaction = await beginTransaction()
  await transaction(sql`/* seedCommittedCopyrightEmailParse */
    INSERT INTO copyright_notice_email_intake_parses (
      copyright_notice_email_intake_id, status, sender_email_ciphertext,
      subject_ciphertext, body_ciphertext, message_id_ciphertext
    ) VALUES (
      ${intake.id}, 'succeeded', ${encryptSecret(`claimant-${randomUUID()}@example.test`, purpose)},
      ${encryptSecret('Copyright complaint', purpose)},
      ${encryptSecret('This is a copyright complaint.', purpose)},
      ${encryptSecret(messageId, purpose)}
    )`)
  const { rows: tokens } = await transaction<{ id: string }>(sql`
    /* seedCommittedCopyrightEmailToken */
    INSERT INTO copyright_notice_email_thread_tokens (lookup_digest)
    VALUES (${reference!.lookup_digest}) RETURNING id`)
  await transaction(sql`/* seedCommittedCopyrightEmailReference */
    INSERT INTO copyright_notice_email_thread_references (
      copyright_notice_email_intake_id, token_id, reference_kind
    ) VALUES (${intake.id}, ${tokens[0]!.id}, 'message_id')`)
  await transaction.commit()
  return intake
}
