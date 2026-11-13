import type { CopyrightDeliveryIntentRecord } from '../services/copyright-notices/delivery-types.mts'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decryptSecret } from '@modules/token-secrets'
import { readEffectiveReviewState } from './copyright-effective-review-state.mts'

type Work = CopyrightDeliveryIntentRecord & {
  copyright_notice_target_id: string | null
  copyright_notice_email_intake_receipt_id: string | null
  recipient_user_erased_at: string | null
  idempotency_key: string
  generation: number
  lease_expires_at: string | null
  leased_at: string | null
  delivery_attempted_at: string | null
  sent_at: string | null
  failed_at: string | null
  available_at: string
  bounced_at: string | null
  failure_ciphertext: string | null
  body_ciphertext: string | null
  created_at: string
  updated_at: string
}
type Attempt = {
  id: string
  work_item_id: string
  generation: number
  attempt_number: number
  lease_token: string
  started_at: string
  created_at: string
}
type Result = {
  attempt_id: string
  sent_at: string | null
  failed_at: string | null
  bounced_at: string | null
  abandoned_at: string | null
}

export async function readStatementTransportState(intentId: string) {
  const { rows } = await write<{
    notice_id: string
    recipient_id: string | null
    work: Work
    attempts: Attempt[]
    results: Result[]
    recipient_email: string | null
    notifications: { title: string; body: string; path: string | null; intent: string | null }[]
    now: Date
  }>(sql`/* readStatementTransportState */
    SELECT work.copyright_notice_id AS notice_id, work.recipient_user_id AS recipient_id,
      to_jsonb(work) AS work, recipient.email_ciphertext AS recipient_email,
      ARRAY(SELECT jsonb_build_object('title', notification.title, 'body', notification.body,
        'path', notification.target_path, 'intent', notification.target_intent)
        FROM notifications notification WHERE notification.user_id = work.recipient_user_id
          AND notification.event_key = 'copyright-delivery:' || work.id::text
        ORDER BY notification.id) AS notifications,
      ARRAY(SELECT to_jsonb(attempt) FROM copyright_notice_delivery_attempts attempt
        WHERE attempt.work_item_id = work.id ORDER BY attempt.attempt_number) AS attempts,
      ARRAY(SELECT to_jsonb(result) FROM copyright_notice_delivery_attempt_results result
        JOIN copyright_notice_delivery_attempts attempt ON attempt.id = result.attempt_id
        WHERE attempt.work_item_id = work.id ORDER BY attempt.attempt_number) AS results,
      clock_timestamp() AS now
    FROM copyright_notice_delivery_work_items work
    LEFT JOIN copyright_notice_delivery_recipients recipient
      ON recipient.copyright_notice_delivery_work_item_id = work.id
    WHERE work.id = ${intentId}`)
  const row = rows[0]
  if (!row) throw new Error('Owned statement transport disappeared')
  return {
    now: row.now,
    state: {
      legal: await readEffectiveReviewState(
        row.notice_id,
        row.recipient_id ? [row.recipient_id] : [],
      ),
      work: row.work,
      attempts: row.attempts,
      results: row.results,
      email: row.recipient_email
        ? decryptSecret(row.recipient_email, `copyright-delivery-recipient:${intentId}`)
        : null,
      notifications: row.notifications,
    },
  }
}

export type StatementTransportState = Awaited<
  ReturnType<typeof readStatementTransportState>
>['state']

export function statementInAppKind(kind: CopyrightDeliveryIntentRecord['delivery_kind']) {
  switch (kind) {
    case 'claimant_receipt':
    case 'status_update':
    case 'poster_restriction_notice':
    case 'poster_review_notice':
    case 'poster_restoration_notice':
    case 'owner_information_notice':
    case 'claimant_decision_notice':
    case 'redress_decision_notice':
      return kind
    case 'counter_notice_forwarding':
    case 'email_intake_needs_information':
    case 'email_intake_received':
    case 'email_intake_rejected':
    case 'staff_information_request':
      throw new Error(`Statement fixture has no in-app transport: ${kind}`)
  }
}
