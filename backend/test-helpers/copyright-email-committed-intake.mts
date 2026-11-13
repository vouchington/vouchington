import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { copyrightEmailIntakePurpose } from '../services/copyright-notices/email-intakes.mts'
import {
  buildCopyrightEmailThreadReferenceRows,
  encryptCopyrightEmailReplyHeaders,
} from '../services/copyright-notices/email-thread-references.mts'
import { createUnparsedCopyrightEmailIntake } from './copyright-email-intake-fixtures.mts'
import { createCopyrightNoticeForManualAssociation } from './copyright-email-manual-association.mts'
import { insertTestBareCopyrightTarget } from './copyright-bare-target.mts'

/** Commit owned parse and reference facts before exercising a later writer. */
export async function createCommittedCopyrightEmailIntake({
  messageId = `<${randomUUID()}@example.test>`,
  inReplyTo = [],
  replyReferences = [],
}: {
  messageId?: string
  inReplyTo?: string[]
  replyReferences?: string[]
} = {}) {
  const intake = await createUnparsedCopyrightEmailIntake()
  const purpose = copyrightEmailIntakePurpose(intake.amazon_ses_message_id)
  const payload = JSON.stringify(
    buildCopyrightEmailThreadReferenceRows({ messageId, inReplyTo, references: replyReferences }),
  )
  await using transaction = await beginTransaction()
  await transaction(sql`/* seedCommittedCopyrightEmailParse */
    INSERT INTO copyright_notice_email_intake_parses (
      copyright_notice_email_intake_id, status, sender_email_ciphertext,
      subject_ciphertext, body_ciphertext, message_id_ciphertext, reply_references_ciphertext
    ) VALUES (
      ${intake.id}, 'succeeded', ${encryptSecret(`claimant-${randomUUID()}@example.test`, purpose)},
      ${encryptSecret('Copyright complaint', purpose)},
      ${encryptSecret('This is a copyright complaint.', purpose)},
      ${encryptSecret(messageId, purpose)},
      ${encryptCopyrightEmailReplyHeaders({ inReplyTo, references: replyReferences }, purpose)}
    )`)
  await transaction(sql`/* seedCommittedCopyrightEmailTokens */
    INSERT INTO copyright_notice_email_thread_tokens (lookup_digest)
    SELECT DISTINCT reference.lookup_digest
    FROM jsonb_to_recordset(${payload}::jsonb) AS reference(lookup_digest text)
    ORDER BY reference.lookup_digest ON CONFLICT (lookup_digest) DO NOTHING`)
  await transaction(sql`/* seedCommittedCopyrightEmailReferences */
    INSERT INTO copyright_notice_email_thread_references (
      copyright_notice_email_intake_id, token_id, reference_kind
    ) SELECT ${intake.id}::uuid, token.id, reference.reference_kind
      FROM jsonb_to_recordset(${payload}::jsonb) AS reference(
        lookup_digest text, reference_kind copyright_notice_email_thread_reference_kinds
      ) JOIN copyright_notice_email_thread_tokens token
        ON token.lookup_digest = reference.lookup_digest`)
  await transaction.commit()
  return intake
}

/** The root was approved and its waiting reply linked before the intermediate writer arrives. */
export async function createCommittedWaitingCopyrightEmailThread(reviewedById: string) {
  const rootMessageId = `<${randomUUID()}@example.test>`
  const intermediateMessageId = `<${randomUUID()}@example.test>`
  const [reply, root, noticeId] = await Promise.all([
    createCommittedCopyrightEmailIntake({
      inReplyTo: [intermediateMessageId],
      replyReferences: [rootMessageId],
    }),
    createCommittedCopyrightEmailIntake({ messageId: rootMessageId }),
    createCopyrightNoticeForManualAssociation(),
  ])
  const rationale = encryptSecret(
    'The root email is a complete statutory notice.',
    copyrightEmailIntakePurpose(root.amazon_ses_message_id),
  )
  await using transaction = await beginTransaction()
  await insertTestBareCopyrightTarget(noticeId, reviewedById, transaction)
  await transaction(sql`/* seedCommittedCopyrightEmailRootDecision */
    UPDATE copyright_notice_email_intake_receipts
    SET review_decision = 'approved', reviewed_at = CURRENT_TIMESTAMP,
      reviewed_by_id = ${reviewedById}, review_rationale_ciphertext = ${rationale}
    WHERE id = ${root.id}`)
  await transaction(sql`/* seedCommittedCopyrightEmailRootReview */
    INSERT INTO copyright_notice_email_intake_reviews (
      copyright_notice_email_intake_receipt_id, reviewed_at, reviewed_by_id,
      decision, rationale_ciphertext, promoted_copyright_notice_id
    ) VALUES (${root.id}, CURRENT_TIMESTAMP, ${reviewedById}, 'approved', ${rationale}, ${noticeId})`)
  await transaction(sql`/* seedCommittedCopyrightEmailRootLinks */
    INSERT INTO copyright_notice_email_intake_notice_links (
      copyright_notice_email_intake_id, copyright_notice_id, link_kind, correspondence_action
    ) VALUES (${root.id}, ${noticeId}, 'initial', NULL),
      (${reply.id}, ${noticeId}, 'thread', 'pending')`)
  await transaction(sql`/* seedCommittedCopyrightEmailWaitingEdge */
    INSERT INTO copyright_notice_email_message_ancestors (
      reply_message_intake_receipt_id, ancestor_message_intake_receipt_id, reference_kind
    ) VALUES (${reply.id}, ${root.id}, 'references')`)
  await transaction.commit()
  return {
    rootMessageId,
    intermediateMessageId,
    rootIntakeId: root.id,
    replyIntakeId: reply.id,
    noticeId,
  }
}
