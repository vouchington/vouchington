import { createHash } from 'node:crypto'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { write } from '@data-stores/psql'
import type { CreateSesBounceEventInput, SesBounceEvent } from './types.mts'

const VALID_NOTIFICATION_TYPES = new Set(['bounce', 'complaint', 'delivery'])
const VALID_BOUNCE_TYPES = new Set(['permanent', 'transient', 'undetermined'])

function normalizeRecipients(recipients: string[]): string[] {
  return recipients
    .flatMap(r => (typeof r === 'string' ? [r.toLowerCase().trim()] : []))
    .filter(Boolean)
}

// Content-derived, not the SNS/SQS envelope id: MessageDeduplicationId is FIFO-only and
// unavailable on a standard queue. Recipients are part of the key because a multi-recipient
// `delivery` notification can be split across separate per-recipient notifications that share
// mail.messageId, notification type, and (second-precision) timestamp -- without the recipient
// set, the second notification would be silently dropped as a "duplicate" of the first.
function deriveDedupKey(
  input: CreateSesBounceEventInput,
  normalizedRecipients: string[],
): string | null {
  const messageId = input.ses_message_id?.trim() ?? ''
  if (!messageId || !input.ses_timestamp) return null
  const recipientsKey = Array.from(new Set(normalizedRecipients)).toSorted().join(',')
  return createHash('sha256')
    .update(
      `${messageId} ${input.notification_type} ${input.ses_timestamp.toISOString()} ${recipientsKey}`,
    )
    .digest('hex')
}

export async function createSesBounceEvent(
  input: CreateSesBounceEventInput,
): Promise<SesBounceEvent | null> {
  assert(
    VALID_NOTIFICATION_TYPES.has(input.notification_type),
    422,
    `Invalid notification_type: ${input.notification_type}`,
  )
  assert(
    input.bounce_type == null || VALID_BOUNCE_TYPES.has(input.bounce_type),
    422,
    `Invalid bounce_type: ${input.bounce_type}`,
  )

  const normalizedRecipients = normalizeRecipients(input.recipients)
  const dedupKey = deriveDedupKey(input, normalizedRecipients)

  const { rows } = await write(sql`/* createSesBounceEvent */
    INSERT INTO ses_bounce_events (
      notification_type,
      bounce_type,
      bounce_sub_type,
      recipients,
      ses_message_id,
      ses_feedback_id,
      ses_timestamp,
      raw_message,
      diagnostic_code,
      reporting_mta,
      dedup_key
    )
    VALUES (
      ${input.notification_type}::ses_notification_types,
      ${input.bounce_type ?? null}::ses_bounce_types,
      ${input.bounce_sub_type ?? null},
      ${JSON.stringify(normalizedRecipients)}::jsonb,
      ${input.ses_message_id ?? null},
      ${input.ses_feedback_id ?? null},
      ${input.ses_timestamp ?? null},
      ${JSON.stringify(input.raw_message)}::jsonb,
      ${input.diagnostic_code ?? null},
      ${input.reporting_mta ?? null},
      ${dedupKey}
    )
    ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING
    RETURNING
      id,
      notification_type,
      bounce_type,
      bounce_sub_type,
      recipients,
      ses_message_id,
      ses_feedback_id,
      ses_timestamp,
      raw_message,
      diagnostic_code,
      reporting_mta,
      dedup_key,
      uuid_extract_timestamp(id) AS created_at
  `)

  if (rows.length === 0) {
    assert(dedupKey, 500, 'Failed to create ses_bounce_event')
    return null
  }
  assert(rows.length === 1, 500, 'Failed to create ses_bounce_event')
  return rows[0] as SesBounceEvent
}
