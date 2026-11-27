import { createHash } from 'node:crypto'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { read, write } from '@data-stores/psql'
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
  const subtype = input.amazon_ses_bounce_subtype_id ?? null
  const subtypeId = subtype === null ? null : await resolveSesBounceSubtypeId(subtype)

  const { rows } = await write<SesBounceEvent>(sql`/* createSesBounceEvent */
    WITH inserted_event AS (
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
      ${subtypeId},
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
      ORDER BY recipient.email_address ASC NULLS LAST
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
      ${subtype}::text AS amazon_ses_bounce_subtype_id,
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
  `)

  if (rows.length === 0) {
    assert(dedupKey, 500, 'Failed to create ses_bounce_event')
    return null
  }
  assert(rows.length === 1, 500, 'Failed to create ses_bounce_event')
  return rows[0]
}

async function resolveSesBounceSubtypeId(subtype: string): Promise<string> {
  const { rows: existing } = await read<{ id: string }>(sql`/* findSesBounceSubtype */
    SELECT id FROM amazon_ses_bounce_subtypes WHERE amazon_ses_bounce_subtype = ${subtype}
  `)
  if (existing[0]?.id) return existing[0].id
  const { rows: inserted } = await write<{ id: string }>(sql`/* registerSesBounceSubtype */
    INSERT INTO amazon_ses_bounce_subtypes (amazon_ses_bounce_subtype)
    VALUES (${subtype})
    ON CONFLICT (amazon_ses_bounce_subtype) DO NOTHING
    RETURNING id
  `)
  if (inserted[0]?.id) return inserted[0].id
  const { rows: raced } = await write<{ id: string }>(sql`/* findRegisteredSesBounceSubtype */
    SELECT id FROM amazon_ses_bounce_subtypes WHERE amazon_ses_bounce_subtype = ${subtype}
  `)
  const id = raced[0]?.id
  assert(id, 500, `amazon_ses_bounce_subtypes row missing after conflict: ${subtype}`)
  return id
}
