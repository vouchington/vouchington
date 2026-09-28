import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { lockCurrentCopyrightTerritorialPolicy } from './territorial-policy.mts'
import {
  assertBoundedText,
  assertIdempotencyKey,
  sameSha256,
  territorialRequestSha256,
  type TerritorialNoticeRequest,
} from './territorial-fields.mts'

export type EuCopyrightNoticeReceipt = {
  notice_id: string
  receipt_id: string
  acknowledgment_id: string
  route_destination: 'staff_queue'
  is_duplicate: boolean
}

type EuReceiptRow = Omit<EuCopyrightNoticeReceipt, 'is_duplicate'> & {
  request_sha256: Uint8Array
}

export async function receiveEuCopyrightNotice(
  actor: PrivateUser,
  idempotencyKey: string,
  request: TerritorialNoticeRequest,
): Promise<EuCopyrightNoticeReceipt> {
  await using transaction = await beginTransaction()
  const receipt = await receiveEuCopyrightNoticeInTransaction(
    actor,
    idempotencyKey,
    request,
    transaction,
  )
  await transaction.commit()
  return receipt
}

export async function receiveEuCopyrightNoticeInTransaction(
  actor: PrivateUser,
  idempotencyKey: string,
  request: TerritorialNoticeRequest,
  transaction: TransactionQuery,
): Promise<EuCopyrightNoticeReceipt> {
  assertIdempotencyKey(idempotencyKey)
  const fields = {
    contact: assertBoundedText(request.contact, 4096, 'contact is required'),
    contentDescription: assertBoundedText(
      request.contentDescription,
      50_000,
      'content_description is required',
    ),
    grounds: assertBoundedText(request.grounds, 50_000, 'grounds are required'),
    hostedUseUrl: assertBoundedText(request.hostedUseUrl, 2048, 'hosted_use_url is required'),
  }
  const requestSha256 = territorialRequestSha256(fields)
  await transaction(sql`/* receiveEuCopyrightNotice:lock */
    SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.id}:${idempotencyKey}`}, 0))
  `)
  const { rows: existingRows } = await transaction<EuReceiptRow>(
    sql`/* receiveEuCopyrightNotice:existing */
    SELECT receipt.copyright_notice_id AS notice_id, receipt.id AS receipt_id,
      receipt.request_sha256, acknowledgment.id AS acknowledgment_id,
      routing.destination AS route_destination
    FROM copyright_eu_notice_receipts receipt
    JOIN copyright_eu_notice_acknowledgments acknowledgment
      ON acknowledgment.copyright_eu_notice_receipt_id = receipt.id
    JOIN copyright_eu_notice_routings routing
      ON routing.copyright_eu_notice_receipt_id = receipt.id
    WHERE receipt.requester_user_id = ${actor.id} AND receipt.idempotency_key = ${idempotencyKey}
  `,
  )
  const existing = existingRows[0]
  if (existing) {
    assert(
      sameSha256(existing.request_sha256, requestSha256),
      409,
      'Idempotency-Key was reused for a different request',
    )
    return {
      notice_id: existing.notice_id,
      receipt_id: existing.receipt_id,
      acknowledgment_id: existing.acknowledgment_id,
      route_destination: existing.route_destination,
      is_duplicate: true,
    }
  }
  const approval = await lockCurrentCopyrightTerritorialPolicy('eu_dsa', transaction)
  const purpose = `copyright-eu-notice:${idempotencyKey}`
  const { rows: notices } = await transaction<{
    id: string
  }>(sql`/* receiveEuCopyrightNotice:notice */
    INSERT INTO copyright_notices (
      jurisdiction, legal_basis, received_at, claimant_user_id, claimant_contact_ciphertext,
      work_description, policy_version
    ) VALUES (
      'eu_dsa', 'copyright', CURRENT_TIMESTAMP, ${actor.id},
      ${encryptSecret(fields.contact, `${purpose}:contact`)},
      ${fields.contentDescription}, ${approval.policy_version}
    )
    RETURNING id
  `)
  const notice = notices[0]
  assert(notice, 500, 'Failed to record EU copyright notice')
  const { rows: receipts } = await transaction<{ id: string }>(
    sql`/* receiveEuCopyrightNotice:receipt */
    INSERT INTO copyright_eu_notice_receipts (
      copyright_notice_id, copyright_territorial_policy_approval_id, requester_user_id,
      idempotency_key, request_sha256, hosted_use_url, grounds_ciphertext
    ) VALUES (
      ${notice.id}, ${approval.id}, ${actor.id}, ${idempotencyKey}, ${requestSha256},
      ${fields.hostedUseUrl}, ${encryptSecret(fields.grounds, `${purpose}:grounds`)}
    )
    RETURNING id
  `,
  )
  const receipt = receipts[0]
  assert(receipt, 500, 'Failed to record EU copyright notice')
  await transaction(sql`/* receiveEuCopyrightNotice:routing */
    INSERT INTO copyright_eu_notice_routings (copyright_eu_notice_receipt_id, destination)
    VALUES (${receipt.id}, 'staff_queue')
  `)
  const { rows: acknowledgments } = await transaction<{ id: string }>(
    sql`/* receiveEuCopyrightNotice:acknowledgment */
    INSERT INTO copyright_eu_notice_acknowledgments (copyright_eu_notice_receipt_id)
    VALUES (${receipt.id})
    RETURNING id
  `,
  )
  const acknowledgment = acknowledgments[0]
  assert(acknowledgment, 500, 'Failed to record EU copyright notice')
  return {
    notice_id: notice.id,
    receipt_id: receipt.id,
    acknowledgment_id: acknowledgment.id,
    route_destination: 'staff_queue',
    is_duplicate: false,
  }
}
