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
  const messageId = input.amazon_ses_message_id?.trim() ?? ''
  if (!messageId || !input.occurred_at) return null
  const recipientsKey = Array.from(new Set(normalizedRecipients)).toSorted().join(',')
  return createHash('sha256')
    .update(
      `${messageId} ${input.notification_type} ${input.occurred_at.toISOString()} ${recipientsKey}`,
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
    WITH registered_subtype AS (
      INSERT INTO amazon_ses_bounce_subtypes (id)
      SELECT ${input.amazon_ses_bounce_subtype_id ?? null}::text AS id
      WHERE ${input.amazon_ses_bounce_subtype_id ?? null}::text IS NOT NULL
      ORDER BY id ASC NULLS LAST
      ON CONFLICT (id) DO NOTHING
    )
    INSERT INTO amazon_ses_bounce_events (
      notification_type,
      bounce_type,
      amazon_ses_bounce_subtype_id,
      recipients,
      amazon_ses_message_id,
      amazon_ses_feedback_id,
      occurred_at,
      raw_message,
      diagnostic_code,
      reporting_mta,
      dedup_key
    )
    VALUES (
      ${input.notification_type}::amazon_ses_notification_types,
      ${input.bounce_type ?? null}::amazon_ses_bounce_types,
      ${input.amazon_ses_bounce_subtype_id ?? null},
      ${JSON.stringify(normalizedRecipients)}::jsonb,
      ${input.amazon_ses_message_id ?? null},
      ${input.amazon_ses_feedback_id ?? null},
      ${input.occurred_at ?? null},
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
      amazon_ses_bounce_subtype_id,
      recipients,
      amazon_ses_message_id,
      amazon_ses_feedback_id,
      occurred_at,
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
