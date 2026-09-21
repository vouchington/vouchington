import { beginTransaction, read } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import type { CopyrightCorrespondenceKind, CopyrightCorrespondenceRecord } from './types.mts'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'

type OutboundCompositionKind = 'deterministic_template' | 'staff' | 'agent'

export async function createDeterministicCopyrightCorrespondenceInTransaction(
  input: {
    noticeId: string
    submissionId: string | null
    correspondenceKind: CopyrightCorrespondenceKind
    bodyText: string
  },
  transaction: TransactionQuery,
): Promise<CopyrightCorrespondenceRecord> {
  assert(input.bodyText.trim().length > 0, 422, 'Copyright correspondence body is required')
  const id = uuidv7()
  const { rows } = await transaction<CopyrightCorrespondenceRecord>(
    sql`/* createDeterministicCopyrightCorrespondenceInTransaction */
      INSERT INTO copyright_notice_correspondence_messages (
        id, copyright_notice_id, copyright_notice_submission_id, direction, correspondence_kind,
        composition_kind, body_ciphertext, drafted_by_id
      )
      SELECT ${id}, ${input.noticeId}, ${input.submissionId}, 'outbound', ${input.correspondenceKind},
        'deterministic_template', ${encryptSecret(input.bodyText, copyrightCorrespondencePurpose(id))}, NULL
      FROM copyright_notices notice
      WHERE notice.id = ${input.noticeId}
        AND (${input.submissionId}::uuid IS NULL OR EXISTS (
          SELECT 1 FROM copyright_notice_submissions submission
          WHERE submission.id = ${input.submissionId} AND submission.copyright_notice_id = notice.id
        ))
      RETURNING id, copyright_notice_id, copyright_notice_submission_id, copyright_notice_email_intake_id,
        direction, correspondence_kind, composition_kind, body_ciphertext, drafted_by_id,
        approved_at, approved_by_id, sent_at
    `,
  )
  const correspondence = rows[0]
  assert(correspondence, 404, 'Copyright notice or case submission not found')
  return correspondence
}

export async function getCopyrightEmailCorrespondence(intentId: string): Promise<{
  intent: import('./delivery-types.mts').CopyrightDeliveryIntentRecord
  bodyText: string
}> {
  const { rows } = await read<{
    id: string
    copyright_notice_id: string
    copyright_notice_submission_id: string | null
    copyright_notice_correspondence_message_id: string
    recipient_user_id: string | null
    recipient_role: 'claimant' | 'poster' | 'correspondent'
    delivery_kind: import('./delivery-types.mts').CopyrightDeliveryIntentRecord['delivery_kind']
    channel: 'email'
    state: import('./delivery-types.mts').CopyrightDeliveryIntentRecord['state']
    ses_message_id: string | null
    delivery_attempt_count: number
    body_ciphertext: string
  }>(sql`/* getCopyrightEmailCorrespondence */
      SELECT intent.id, intent.copyright_notice_id, intent.copyright_notice_submission_id,
        intent.copyright_notice_correspondence_message_id, intent.recipient_user_id,
        intent.recipient_role, intent.delivery_kind, intent.channel, intent.state, intent.ses_message_id,
        intent.delivery_attempt_count,
        correspondence.body_ciphertext
      FROM copyright_notice_delivery_intents intent
      JOIN copyright_notice_correspondence_messages correspondence
        ON correspondence.id = intent.copyright_notice_correspondence_message_id
      WHERE intent.id = ${intentId} AND intent.channel = 'email'
    `)
  const row = rows[0]
  if (!row) throw new Error('Copyright email delivery intent has no correspondence')
  return {
    intent: row,
    bodyText: decryptSecret(
      row.body_ciphertext,
      copyrightCorrespondencePurpose(row.copyright_notice_correspondence_message_id),
    ),
  }
}

export function copyrightCorrespondencePurpose(correspondenceId: string): string {
  return `copyright-correspondence:${correspondenceId}`
}

export async function createOutboundCopyrightCorrespondence(input: {
  noticeId: string
  submissionId: string | null
  correspondenceKind: CopyrightCorrespondenceKind
  compositionKind: OutboundCompositionKind
  bodyCiphertext: string
  draftedById: string | null
}): Promise<CopyrightCorrespondenceRecord> {
  await using transaction = await beginTransaction()
  const { rows } =
    await transaction<CopyrightCorrespondenceRecord>(sql`/* createOutboundCopyrightCorrespondence */
    INSERT INTO copyright_notice_correspondence_messages (
      copyright_notice_id, copyright_notice_submission_id, direction, correspondence_kind,
      composition_kind, body_ciphertext, drafted_by_id
    )
    SELECT
      ${input.noticeId}, ${input.submissionId}, 'outbound', ${input.correspondenceKind},
      ${input.compositionKind}, ${input.bodyCiphertext}, ${input.draftedById}
    FROM copyright_notices notice
    WHERE notice.id = ${input.noticeId}
      AND (
        ${input.submissionId}::uuid IS NULL
        OR EXISTS (
          SELECT 1 FROM copyright_notice_submissions submission
          WHERE submission.id = ${input.submissionId}
            AND submission.copyright_notice_id = notice.id
        )
      )
    RETURNING id, copyright_notice_id, copyright_notice_submission_id, copyright_notice_email_intake_id,
      direction, correspondence_kind,
      composition_kind, body_ciphertext, drafted_by_id, approved_at, approved_by_id, sent_at
  `)
  const correspondence = rows[0]
  assert(correspondence, 404, 'Copyright notice or case submission not found')
  await transaction(sql`/* createOutboundCopyrightCorrespondence:event */
    INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, metadata)
    VALUES (${input.noticeId}, 'outbound_correspondence_created', '{}'::jsonb)
  `)
  await transaction.commit()
  return correspondence
}

export async function approveCopyrightCorrespondence(input: {
  currentUser: PrivateUser
  correspondenceId: string
  approvedAt: Date
}): Promise<CopyrightCorrespondenceRecord> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  await using transaction = await beginTransaction()
  const { rows } =
    await transaction<CopyrightCorrespondenceRecord>(sql`/* approveCopyrightCorrespondence */
    UPDATE copyright_notice_correspondence_messages
    SET approved_at = ${input.approvedAt}, approved_by_id = ${input.currentUser.id}
    WHERE id = ${input.correspondenceId}
      AND direction = 'outbound'
      AND composition_kind = 'agent'
      AND approved_at IS NULL
    RETURNING id, copyright_notice_id, copyright_notice_submission_id, copyright_notice_email_intake_id,
      direction, correspondence_kind,
      composition_kind, body_ciphertext, drafted_by_id, approved_at, approved_by_id, sent_at
  `)
  const correspondence = rows[0]
  assert(correspondence, 409, 'Only an unapproved agent-composed outbound message can be approved')
  await transaction(sql`/* approveCopyrightCorrespondence:event */
    INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, actor_user_id, metadata)
    VALUES (${correspondence.copyright_notice_id}, 'agent_correspondence_approved', ${input.currentUser.id}, '{}'::jsonb)
  `)
  await transaction.commit()
  return correspondence
}
