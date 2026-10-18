import type { TransactionQuery } from '@data-stores/psql/types'
import { encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type {
  CopyrightDeliveryIntentRecord,
  CopyrightNoticeDeliveryKind,
} from './delivery-types.mts'

export type CopyrightDeliveryIntentInput = {
  noticeId: string
  submissionId: string | null
  correspondenceId: string | null
  recipientUserId: string | null
  recipientRole: 'claimant' | 'poster' | 'informed_owner' | 'correspondent'
  deliveryKind: CopyrightNoticeDeliveryKind
  channel: CopyrightDeliveryIntentRecord['channel']
  idempotencyKey: string
  recipientEmail?: string
  targetPath?: string
}

type KeyedIntent = CopyrightDeliveryIntentRecord & { idempotency_key: string }

/**
 * Creates every delivery intent, then every email recipient, in two statements however many
 * intents there are. Results align with `inputs`. Each input behaves as it would alone: a replayed
 * key returns the stored intent, and a key reused for a different delivery is a 409.
 */
export async function createCopyrightDeliveryIntents(
  inputs: readonly CopyrightDeliveryIntentInput[],
  transaction: TransactionQuery,
): Promise<CopyrightDeliveryIntentRecord[]> {
  if (inputs.length === 0) return []
  for (const input of inputs) assertDeliveryIntentInput(input)
  // Sequential creation would replay a repeated key against the first input, so only the first
  // input of a key is inserted and stores its address; every later one must describe the same delivery.
  const seen = new Set<string>()
  const firstOfKey = inputs.map(input => {
    if (seen.has(input.idempotencyKey)) return false
    seen.add(input.idempotencyKey)
    return true
  })
  const unique = inputs.filter((_, index) => firstOfKey[index])
  const { rows: inserted } = await transaction<KeyedIntent>(
    sql`/* createCopyrightDeliveryIntents */
    INSERT INTO copyright_notice_delivery_work_items (
      copyright_notice_id, copyright_notice_submission_id, copyright_notice_correspondence_message_id,
      recipient_user_id, recipient_role, delivery_kind, target_path, channel, idempotency_key
    ) SELECT input.notice_id, input.submission_id, input.correspondence_id,
      input.recipient_user_id, input.recipient_role, input.delivery_kind, input.target_path, input.channel,
      input.idempotency_key
    FROM unnest(
      ${unique.map(input => input.noticeId)}::uuid[],
      ${unique.map(input => input.submissionId)}::uuid[],
      ${unique.map(input => input.correspondenceId)}::uuid[],
      ${unique.map(input => input.recipientUserId)}::uuid[],
      ${unique.map(input => input.recipientRole)}::copyright_notice_delivery_intent_recipient_roles[],
      ${unique.map(input => input.deliveryKind)}::copyright_notice_delivery_kinds[],
      ${unique.map(input => input.targetPath ?? null)}::text[],
      ${unique.map(input => input.channel)}::copyright_notice_delivery_intent_channels[],
      ${unique.map(input => input.idempotencyKey)}::text[]
    ) AS input(
      notice_id, submission_id, correspondence_id, recipient_user_id, recipient_role, delivery_kind,
      target_path, channel, idempotency_key
    )
    WHERE EXISTS (SELECT 1 FROM copyright_notices WHERE id = input.notice_id)
      AND (input.submission_id IS NULL OR EXISTS (
        SELECT 1 FROM copyright_notice_submissions
        WHERE id = input.submission_id AND copyright_notice_id = input.notice_id
      ))
      AND (input.correspondence_id IS NULL OR EXISTS (
        SELECT 1 FROM copyright_notice_correspondence_messages
        WHERE id = input.correspondence_id AND copyright_notice_id = input.notice_id
      ))
    ORDER BY input.idempotency_key ASC NULLS LAST
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id, lease_token, copyright_notice_id, copyright_notice_submission_id,
      copyright_notice_correspondence_message_id, recipient_user_id, recipient_role, delivery_kind, target_path,
      channel, state, amazon_ses_message_id, attempt_count, idempotency_key
  `,
  )
  const byKey = new Map<string, KeyedIntent>(inserted.map(row => [row.idempotency_key, row]))
  const missingKeys = new Set<string>()
  for (const { idempotencyKey } of inputs)
    if (!byKey.has(idempotencyKey)) missingKeys.add(idempotencyKey)
  const existingByKey = new Map<string, KeyedIntent>()
  if (missingKeys.size > 0) {
    const { rows: existingRows } = await transaction<KeyedIntent>(
      sql`/* createCopyrightDeliveryIntents:existing */
      SELECT id, lease_token, copyright_notice_id, copyright_notice_submission_id,
      copyright_notice_correspondence_message_id, recipient_user_id, recipient_role, delivery_kind, target_path,
      channel, state, amazon_ses_message_id, attempt_count, idempotency_key
      FROM copyright_notice_delivery_work_items
      WHERE idempotency_key = ANY(${[...missingKeys]}::text[])
    `,
    )
    for (const row of existingRows) existingByKey.set(row.idempotency_key, row)
  }
  const created = new Set(inserted.map(row => row.idempotency_key))
  const intents = inputs.map((input, index) => {
    const intent = byKey.get(input.idempotencyKey)
    if (intent) {
      if (!firstOfKey[index]) assertReplayMatches(intent, input)
      return intent
    }
    const existing = existingByKey.get(input.idempotencyKey)
    assert(existing, 404, 'Copyright notice was not found')
    assertReplayMatches(existing, input)
    return existing
  })
  await insertCopyrightDeliveryRecipients(
    inputs.flatMap((input, index) =>
      firstOfKey[index] && created.has(input.idempotencyKey) && input.recipientEmail
        ? [{ recipientEmail: input.recipientEmail, intentId: intents[index]!.id }]
        : [],
    ),
    transaction,
  )
  return intents
}

/** Inserts the encrypted email addresses of many intents in one statement. */
export async function insertCopyrightDeliveryRecipients(
  recipients: readonly { recipientEmail: string; intentId: string }[],
  transaction: TransactionQuery,
): Promise<void> {
  if (recipients.length === 0) return
  for (const { recipientEmail } of recipients)
    assert(recipientEmail.trim().length > 0, 422, 'Copyright email recipient is required')
  await transaction(sql`/* insertCopyrightDeliveryRecipients */
    INSERT INTO copyright_notice_delivery_recipients (
      copyright_notice_delivery_work_item_id, email_ciphertext
    ) SELECT recipient.intent_id, recipient.email_ciphertext FROM unnest(
      ${recipients.map(({ intentId }) => intentId)}::uuid[],
      ${recipients.map(({ recipientEmail, intentId }) =>
        encryptSecret(recipientEmail.trim(), `copyright-delivery-recipient:${intentId}`),
      )}::text[]
    ) AS recipient(intent_id, email_ciphertext)
    ORDER BY recipient.intent_id ASC NULLS LAST
    ON CONFLICT (copyright_notice_delivery_work_item_id) DO NOTHING
  `)
}

function assertDeliveryIntentInput(input: CopyrightDeliveryIntentInput): void {
  assert(
    !['poster', 'informed_owner'].includes(input.recipientRole) || input.recipientUserId,
    422,
    'Poster delivery requires a user recipient',
  )
  assert(
    input.recipientRole !== 'correspondent' || (!input.recipientUserId && input.recipientEmail),
    422,
    'Correspondent delivery requires an external email recipient',
  )
  assert(
    (input.recipientRole === 'informed_owner') === Boolean(input.targetPath),
    422,
    'Informed owner delivery requires a community path',
  )
}

function assertReplayMatches(
  existing: CopyrightDeliveryIntentRecord,
  input: CopyrightDeliveryIntentInput,
): void {
  assert(
    existing.copyright_notice_id === input.noticeId &&
      existing.copyright_notice_submission_id === input.submissionId &&
      existing.copyright_notice_correspondence_message_id === input.correspondenceId &&
      existing.recipient_user_id === input.recipientUserId &&
      existing.recipient_role === input.recipientRole &&
      existing.delivery_kind === input.deliveryKind &&
      existing.target_path === (input.targetPath ?? null) &&
      existing.channel === input.channel,
    409,
    'Copyright delivery idempotency key was reused',
  )
}
