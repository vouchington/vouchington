import { createCopyrightPosterNoticesInTransaction } from '../services/copyright-notices/restriction-poster-notices.mts'
import { beginTransaction, read, write } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { copyrightCorrespondencePurpose } from '../services/copyright-notices/correspondence.mts'
import { selectCopyrightStatementFacts } from '../services/copyright-notices/statement-of-reasons-facts.mts'
import { createCopyrightReviewOutcomeNoticesInTransaction } from '../services/copyright-notices/review-outcome-notices.mts'
import { createCopyrightClaimantDecisionNoticeInTransaction } from '../services/copyright-notices/claimant-decision-notices.mts'

export async function readTestCopyrightStatementIntents(noticeId: string) {
  const { rows } = await read<{
    id: string
    delivery_kind: string
    channel: string
    recipient_user_id: string | null
    recipient_role: string
    sent_at: Date | null
    body_ciphertext: string | null
    correspondence_id: string | null
    email_ciphertext: string | null
  }>(sql`/* readTestCopyrightStatementIntents */
    SELECT intent.id, intent.delivery_kind, intent.channel, intent.recipient_user_id, intent.recipient_role, intent.sent_at,
      message.body_ciphertext, message.id AS correspondence_id, recipient.email_ciphertext
    FROM copyright_notice_delivery_intents intent
    LEFT JOIN copyright_notice_correspondence_messages message ON message.id = intent.copyright_notice_correspondence_message_id
    LEFT JOIN copyright_notice_delivery_recipients recipient ON recipient.copyright_notice_delivery_intent_id = intent.id
    WHERE intent.copyright_notice_id = ${noticeId}
      AND intent.delivery_kind IN ('poster_restriction_notice', 'poster_review_notice', 'poster_restoration_notice', 'claimant_decision_notice')
    ORDER BY intent.id
  `)
  return rows.map(row => ({
    ...row,
    text:
      row.body_ciphertext && row.correspondence_id
        ? decryptSecret(row.body_ciphertext, copyrightCorrespondencePurpose(row.correspondence_id))
        : null,
    email: row.email_ciphertext
      ? decryptSecret(row.email_ciphertext, `copyright-delivery-recipient:${row.id}`)
      : null,
  }))
}

export async function readTestCopyrightStatementFacts(noticeId: string, restrictionId?: string) {
  await using transaction = await beginTransaction()
  const facts = await selectCopyrightStatementFacts(noticeId, transaction, { restrictionId })
  await transaction.commit()
  return facts
}

export async function replayTestCopyrightStatementNotices(
  noticeId: string,
  restrictionId: string,
  action: 'confirm' | 'reverse',
) {
  await using transaction = await beginTransaction()
  await createCopyrightReviewOutcomeNoticesInTransaction(
    { noticeId, restrictionId, action },
    transaction,
  )
  await transaction.commit()
}

export async function replayTestCopyrightClaimantDecision(
  noticeId: string,
  event: 'restricted' | 'not_accepted' | 'reversed',
) {
  await using transaction = await beginTransaction()
  await createCopyrightClaimantDecisionNoticeInTransaction({ noticeId, event }, transaction)
  await transaction.commit()
}

export async function eraseTestCopyrightStatementBody(intentId: string): Promise<void> {
  await write(sql`/* eraseTestCopyrightStatementBody */
    UPDATE copyright_notice_correspondence_messages SET body_ciphertext = 'erased'
    WHERE id = (SELECT copyright_notice_correspondence_message_id FROM copyright_notice_delivery_intents WHERE id = ${intentId})
  `)
}

/** Seeds an ended-event obligation to exercise each transport without calling external media delivery. */
export async function createTestCopyrightLiftStatement(input: {
  noticeId: string
  targetId: string
  restrictionId: string
}) {
  await using transaction = await beginTransaction()
  await createCopyrightPosterNoticesInTransaction(
    {
      ...input,
      event: 'restriction_ended',
      restorationCause: 'review_reversed',
      restorationOutcome: 'visible',
    },
    transaction,
  )
  await transaction.commit()
}
