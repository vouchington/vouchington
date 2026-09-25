import { read, write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'
import {
  parseCopyrightSweepPageOptions,
  toCopyrightSweepIdPage,
  type CopyrightSweepIdPage,
  type CopyrightSweepPageOptions,
} from './sweep-id-pages.mts'

type CopyrightEmailIntakeResponse = {
  id: string
  state: 'pending' | 'claimed' | 'sent' | 'failed' | 'bounced'
  delivery_attempt_count: number
}

export class CopyrightEmailIntakeResponseNotClaimedError extends Error {
  constructor() {
    super('Copyright email intake response is not available to send')
  }
}

export async function createCopyrightEmailIntakeResponseInTransaction(
  input: {
    intakeId: string
    intakeSesMessageId: string
    senderEmailCiphertext: string
    responseKind: 'rejected' | 'needs_information'
    responseMessage: string | null
  },
  transaction: TransactionQuery,
): Promise<CopyrightEmailIntakeResponse> {
  const id = uuidv7()
  const purpose = copyrightEmailIntakeResponsePurpose(id)
  const { rows } =
    await transaction<CopyrightEmailIntakeResponse>(sql`/* createCopyrightEmailIntakeResponseInTransaction */
    INSERT INTO copyright_notice_email_intake_responses (
      id, copyright_notice_email_intake_id, response_kind, recipient_email_ciphertext,
      subject_ciphertext, body_ciphertext, idempotency_key
    ) VALUES (
      ${id}, ${input.intakeId}, ${input.responseKind},
      ${encryptSecret(decryptSecret(input.senderEmailCiphertext, copyrightEmailIntakePurpose(input.intakeSesMessageId)), purpose)},
      ${encryptSecret(copyrightEmailIntakeResponseSubject(input.responseKind), purpose)},
      ${encryptSecret(copyrightEmailIntakeResponseBody(input.responseKind, input.responseMessage), purpose)},
      ${`copyright-email-intake-response:${input.intakeId}`}
    ) ON CONFLICT (copyright_notice_email_intake_id) DO NOTHING
    RETURNING id, state, delivery_attempt_count
  `)
  const response = rows[0]
  if (response) return response
  const { rows: existingRows } = await transaction<CopyrightEmailIntakeResponse>(
    sql`/* createCopyrightEmailIntakeResponseInTransaction:existing */
      SELECT id, state, delivery_attempt_count
      FROM copyright_notice_email_intake_responses
      WHERE copyright_notice_email_intake_id = ${input.intakeId}`,
  )
  const existing = existingRows[0]
  assert(existing, 500, 'Copyright email intake response conflict has no stored response')
  return existing
}

export async function prepareCopyrightEmailIntakeResponseDelivery(responseId: string): Promise<{
  recipientEmail: string
  subject: string
  text: string
}> {
  const { rows } = await write<{
    id: string
    recipient_email_ciphertext: string
    subject_ciphertext: string
    body_ciphertext: string
  }>(sql`/* prepareCopyrightEmailIntakeResponseDelivery */
    WITH exhausted AS (
      UPDATE copyright_notice_email_intake_responses
      SET state = 'failed', claimed_at = NULL, failed_at = CURRENT_TIMESTAMP, next_attempt_at = NULL
      WHERE id = ${responseId} AND state = 'claimed'
        AND claimed_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes' AND delivery_attempt_count >= 5
    )
    UPDATE copyright_notice_email_intake_responses
    SET state = 'claimed', claimed_at = CURRENT_TIMESTAMP, delivery_attempted_at = CURRENT_TIMESTAMP,
      next_attempt_at = NULL, delivery_attempt_count = delivery_attempt_count + 1, failure_ciphertext = NULL
    WHERE id = ${responseId} AND delivery_attempt_count < 5
      AND ((state = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP))
        OR (state = 'claimed' AND claimed_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes'))
    RETURNING id, recipient_email_ciphertext, subject_ciphertext, body_ciphertext
  `)
  const response = rows[0]
  if (!response) throw new CopyrightEmailIntakeResponseNotClaimedError()
  const purpose = copyrightEmailIntakeResponsePurpose(response.id)
  return {
    recipientEmail: decryptSecret(response.recipient_email_ciphertext, purpose),
    subject: decryptSecret(response.subject_ciphertext, purpose),
    text: decryptSecret(response.body_ciphertext, purpose),
  }
}

/**
 * Pages the email intake responses that are due or whose claim lease expired. Expired claims at the
 * retry cap stay listed: `prepareCopyrightEmailIntakeResponseDelivery` fails them when their job runs.
 */
export async function searchRecoverableCopyrightEmailIntakeResponseIds(
  options: CopyrightSweepPageOptions,
): Promise<CopyrightSweepIdPage> {
  const { limit, afterId } = parseCopyrightSweepPageOptions(
    options,
    'Invalid copyright email intake response cursor',
  )
  const query = sql`/* searchRecoverableCopyrightEmailIntakeResponseIds */
    SELECT id
    FROM copyright_notice_email_intake_responses
    WHERE (
      (state = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP))
      OR (state = 'claimed' AND claimed_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes')
    )`
  if (afterId) query.append(sql`\n      AND id > ${afterId}`)
  query.append(sql`\n    ORDER BY id LIMIT ${limit + 1}`)
  const { rows } = await read<{ id: string }>(query)
  return toCopyrightSweepIdPage(rows, limit)
}

export async function markCopyrightEmailIntakeResponseBouncedBySesMessageId(
  sesMessageId: string,
): Promise<boolean> {
  const { rows } = await write(sql`/* markCopyrightEmailIntakeResponseBouncedBySesMessageId */
    UPDATE copyright_notice_email_intake_responses
    SET state = 'bounced', bounced_at = CURRENT_TIMESTAMP
    WHERE ses_message_id = ${sesMessageId} AND state = 'sent'
    RETURNING id
  `)
  return rows.length === 1
}

export async function markCopyrightEmailIntakeResponseSent(input: {
  responseId: string
  sesMessageId: string
}): Promise<boolean> {
  const { rows } = await write(sql`/* markCopyrightEmailIntakeResponseSent */
    UPDATE copyright_notice_email_intake_responses
    SET state = 'sent', sent_at = CURRENT_TIMESTAMP, ses_message_id = ${input.sesMessageId}
    WHERE id = ${input.responseId} AND state = 'claimed'
    RETURNING id
  `)
  return rows.length === 1
}

export async function markCopyrightEmailIntakeResponseFailed(input: {
  responseId: string
  error: string
}): Promise<boolean> {
  const { rows } = await write(sql`/* markCopyrightEmailIntakeResponseFailed */
    UPDATE copyright_notice_email_intake_responses
    SET state = CASE WHEN delivery_attempt_count >= 5 THEN 'failed' ELSE 'pending' END,
      claimed_at = NULL,
      failed_at = CASE WHEN delivery_attempt_count >= 5 THEN CURRENT_TIMESTAMP ELSE NULL END,
      next_attempt_at = CASE WHEN delivery_attempt_count >= 5 THEN NULL
        ELSE CURRENT_TIMESTAMP + make_interval(mins => (2 ^ (delivery_attempt_count - 1))::integer) END,
      failure_ciphertext = ${encryptSecret(input.error.slice(0, 10_000), `copyright-email-intake-response:${input.responseId}`)}
    WHERE id = ${input.responseId} AND state = 'claimed'
    RETURNING id
  `)
  return rows.length === 1
}

function copyrightEmailIntakeResponsePurpose(responseId: string): string {
  return `copyright-email-intake-response:${responseId}`
}

function copyrightEmailIntakeResponseSubject(kind: 'rejected' | 'needs_information'): string {
  return kind === 'rejected'
    ? 'We could not accept your copyright notice'
    : 'More information is needed for your copyright notice'
}

function copyrightEmailIntakeResponseBody(
  kind: 'rejected' | 'needs_information',
  responseMessage: string | null,
): string {
  const prefix =
    kind === 'rejected'
      ? 'We could not accept your copyright notice.'
      : 'We need more information before we can evaluate your copyright notice.'
  return responseMessage ? `${prefix}\n\n${responseMessage.trim()}` : prefix
}
