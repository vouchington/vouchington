import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** A case and the in-app delivery intent it owns, which no caseless audit row may name. */
export async function createCopyrightCaseDeliveryIntentRow(): Promise<{
  noticeId: string
  intentId: string
}> {
  const { rows } = await write<{ notice_id: string; intent_id: string }>(
    sql`/* createCopyrightCaseDeliveryIntentRow */
      WITH recipient AS (INSERT INTO users DEFAULT VALUES RETURNING id),
      notice AS (
        INSERT INTO copyright_notices (jurisdiction, legal_basis, received_at, accepted_at,
          claimant_contact_ciphertext, work_description, policy_version)
        VALUES ('us_dmca', 'copyright', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
          ${`cipher-${randomUUID()}`}, ${`work-${randomUUID()}`}, 'test-v1')
        RETURNING id
      )
      INSERT INTO copyright_notice_delivery_work_items (
        copyright_notice_id, recipient_user_id, recipient_role, delivery_kind, channel, idempotency_key
      ) SELECT notice.id, recipient.id, 'poster', 'poster_restriction_notice', 'in_app',
        ${`copyright-case-delivery-${randomUUID()}`} FROM notice CROSS JOIN recipient
      RETURNING id AS intent_id, copyright_notice_id AS notice_id`,
  )
  return { noticeId: rows[0]!.notice_id, intentId: rows[0]!.intent_id }
}

function insertLifecycleEvent(event: {
  noticeId: string | null
  eventType: string
  intentId?: string
  intakeId?: string
}) {
  return write<{ id: string }>(sql`/* insertCopyrightLifecycleEventRow */
    INSERT INTO copyright_notice_lifecycle_changes (
      copyright_notice_id, change_type, copyright_notice_delivery_work_item_id,
      copyright_notice_email_intake_id
    ) VALUES (
      ${event.noticeId}, ${event.eventType}, ${event.intentId ?? null}, ${event.intakeId ?? null}
    ) RETURNING id`)
}

export const insertCaselessReplayEvent = (intentId: string) =>
  insertLifecycleEvent({ noticeId: null, eventType: 'delivery_intent_replayed', intentId })

export const rejectCaselessEventWithoutSource = () =>
  insertLifecycleEvent({ noticeId: null, eventType: 'notice_received' })

export const rejectCaselessEventOfAnotherType = (intakeId: string) =>
  insertLifecycleEvent({ noticeId: null, eventType: 'email_correspondence_rejected', intakeId })

export const rejectCaseReplayOfIntakeReply = (noticeId: string, intentId: string) =>
  insertLifecycleEvent({ noticeId, eventType: 'delivery_intent_replayed', intentId })
