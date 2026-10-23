import { createHash } from 'node:crypto'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { write } from '@data-stores/psql'
import type { CreateSesBounceEventInput, SesBounceEvent } from './types.mts'

const VALID_NOTIFICATION_TYPES = new Set(['bounce', 'complaint'])
const VALID_BOUNCE_TYPES = new Set(['permanent', 'transient', 'undetermined'])

function normalizeRecipients(recipients: string[]): string[] {
  return recipients
    .flatMap(r => (typeof r === 'string' ? [r.toLowerCase().trim()] : []))
    .filter(Boolean)
}

// Content-derived, not the SNS/SQS envelope id: MessageDeduplicationId is FIFO-only and
// unavailable on a standard queue. Recipients are part of the key because a multi-recipient
// notification can be split across separate per-recipient notifications that share
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
      INSERT INTO amazon_ses_bounce_subtypes (amazon_ses_bounce_subtype)
      SELECT ${input.amazon_ses_bounce_subtype_id ?? null}::text AS amazon_ses_bounce_subtype
      WHERE ${input.amazon_ses_bounce_subtype_id ?? null}::text IS NOT NULL
      ON CONFLICT (amazon_ses_bounce_subtype) DO UPDATE
        SET amazon_ses_bounce_subtype = EXCLUDED.amazon_ses_bounce_subtype
      RETURNING id, amazon_ses_bounce_subtype
    ), inserted_event AS (
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
      (SELECT id FROM registered_subtype),
      ${JSON.stringify(normalizedRecipients)}::jsonb,
      ${input.amazon_ses_message_id ?? null},
      ${input.amazon_ses_feedback_id ?? null},
      ${input.occurred_at ?? new Date()},
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
    ), folded_suppressions AS (
      INSERT INTO amazon_ses_address_suppressions (
        email_address, first_event_at, first_notification_type,
        latest_event_at, latest_notification_type
      )
      SELECT DISTINCT recipient.email_address,
        event.occurred_at, event.notification_type,
        event.occurred_at, event.notification_type
      FROM inserted_event event
      CROSS JOIN LATERAL jsonb_array_elements_text(event.recipients) recipient(email_address)
      WHERE event.notification_type = 'complaint'
        OR (event.notification_type = 'bounce' AND event.bounce_type = 'permanent')
      ON CONFLICT (email_address) DO UPDATE SET
        first_event_at = LEAST(amazon_ses_address_suppressions.first_event_at, EXCLUDED.first_event_at),
        first_notification_type = CASE
          WHEN EXCLUDED.first_event_at < amazon_ses_address_suppressions.first_event_at
            OR (
              EXCLUDED.first_event_at = amazon_ses_address_suppressions.first_event_at
              AND EXCLUDED.first_notification_type = 'complaint'
            )
            THEN EXCLUDED.first_notification_type
          ELSE amazon_ses_address_suppressions.first_notification_type
        END,
        latest_event_at = GREATEST(amazon_ses_address_suppressions.latest_event_at, EXCLUDED.latest_event_at),
        latest_notification_type = CASE
          WHEN EXCLUDED.latest_event_at > amazon_ses_address_suppressions.latest_event_at
            OR (
              EXCLUDED.latest_event_at = amazon_ses_address_suppressions.latest_event_at
              AND EXCLUDED.latest_notification_type = 'complaint'
            )
            THEN EXCLUDED.latest_notification_type
          ELSE amazon_ses_address_suppressions.latest_notification_type
        END
      RETURNING email_address
    )
    SELECT
      event.id,
      event.notification_type,
      event.bounce_type,
      subtype.amazon_ses_bounce_subtype AS amazon_ses_bounce_subtype_id,
      event.recipients,
      event.amazon_ses_message_id,
      event.amazon_ses_feedback_id,
      event.occurred_at,
      event.raw_message,
      event.diagnostic_code,
      event.reporting_mta,
      event.dedup_key,
      event.created_at
    FROM inserted_event event
    LEFT JOIN registered_subtype subtype ON subtype.id = event.amazon_ses_bounce_subtype_id
  `)

  if (rows.length === 0) {
    assert(dedupKey, 500, 'Failed to create ses_bounce_event')
    return null
  }
  assert(rows.length === 1, 500, 'Failed to create ses_bounce_event')
  return rows[0] as SesBounceEvent
}
