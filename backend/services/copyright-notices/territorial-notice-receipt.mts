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
import {
  existingReceiptQuery,
  insertAcknowledgmentQuery,
  insertReceiptQuery,
  insertRoutingQuery,
  type TerritorialNoticeReceiptContract,
} from './territorial-notice-receipt-sql.mts'

export type { TerritorialNoticeReceiptContract }

export type TerritorialCopyrightNoticeReceipt = {
  notice_id: string
  receipt_id: string
  acknowledgment_id: string
  route_destination: 'staff_queue'
  is_duplicate: boolean
}

type TerritorialReceiptRow = Omit<TerritorialCopyrightNoticeReceipt, 'is_duplicate'> & {
  request_sha256: Uint8Array
}

const RECEIPT_FAILURES = {
  EU: 'Failed to record EU copyright notice',
  UK: 'Failed to record UK copyright notice',
} as const

const RECEIPT_PURPOSES = {
  'copyright-eu-notice': 'copyright-eu-notice',
  'copyright-uk-notice': 'copyright-uk-notice',
} as const

export async function receiveTerritorialCopyrightNotice(
  actor: PrivateUser,
  contract: TerritorialNoticeReceiptContract,
  idempotencyKey: string,
  request: TerritorialNoticeRequest,
): Promise<TerritorialCopyrightNoticeReceipt> {
  await using transaction = await beginTransaction()
  const receipt = await receiveTerritorialCopyrightNoticeInTransaction(
    actor,
    contract,
    idempotencyKey,
    request,
    transaction,
  )
  await transaction.commit()
  return receipt
}

export async function receiveTerritorialCopyrightNoticeInTransaction(
  actor: PrivateUser,
  contract: TerritorialNoticeReceiptContract,
  idempotencyKey: string,
  request: TerritorialNoticeRequest,
  transaction: TransactionQuery,
): Promise<TerritorialCopyrightNoticeReceipt> {
  assertIdempotencyKey(idempotencyKey)
  const fields = noticeFields(request)
  const requestSha256 = territorialRequestSha256(fields)
  await transaction(sql`/* receiveTerritorialCopyrightNotice:lock */
    SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.id}:${idempotencyKey}`}, 0))
  `)
  const { rows: existingRows } = await transaction<TerritorialReceiptRow>(
    existingReceiptQuery(contract, actor.id, idempotencyKey),
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
  const approval = await lockCurrentCopyrightTerritorialPolicy(contract.jurisdiction, transaction)
  const purpose = receiptPurpose(contract.purposePrefix, idempotencyKey)
  const failure = receiptFailure(contract.label)
  const { rows: notices } = await transaction<{ id: string }>(
    sql`/* receiveTerritorialCopyrightNotice:notice */
    INSERT INTO copyright_notices (
      jurisdiction, legal_basis, received_at, claimant_user_id, claimant_contact_ciphertext,
      work_description, policy_version
    ) VALUES (
      ${contract.jurisdiction}, 'copyright', CURRENT_TIMESTAMP, ${actor.id},
      ${encryptSecret(fields.contact, `${purpose}:contact`)},
      ${fields.contentDescription}, ${approval.policy_version}
    )
    RETURNING id
  `,
  )
  const notice = notices[0]
  assert(notice, 500, failure)
  const { rows: receipts } = await transaction<{ id: string }>(
    insertReceiptQuery(
      contract,
      notice.id,
      approval.id,
      actor.id,
      idempotencyKey,
      requestSha256,
      fields.hostedUseUrl,
      encryptSecret(fields.grounds, `${purpose}:grounds`),
    ),
  )
  const receipt = receipts[0]
  assert(receipt, 500, failure)
  await transaction(insertRoutingQuery(contract, receipt.id))
  const { rows: acknowledgments } = await transaction<{ id: string }>(
    insertAcknowledgmentQuery(contract, receipt.id),
  )
  const acknowledgment = acknowledgments[0]
  assert(acknowledgment, 500, failure)
  return {
    notice_id: notice.id,
    receipt_id: receipt.id,
    acknowledgment_id: acknowledgment.id,
    route_destination: 'staff_queue',
    is_duplicate: false,
  }
}

function noticeFields(request: TerritorialNoticeRequest): TerritorialNoticeRequest {
  return {
    contact: assertBoundedText(request.contact, 4096, 'contact is required'),
    contentDescription: assertBoundedText(
      request.contentDescription,
      50_000,
      'content_description is required',
    ),
    grounds: assertBoundedText(request.grounds, 50_000, 'grounds are required'),
    hostedUseUrl: assertBoundedText(request.hostedUseUrl, 2048, 'hosted_use_url is required'),
  }
}

function receiptFailure(label: TerritorialNoticeReceiptContract['label']): string {
  const failure = RECEIPT_FAILURES[label]
  assert(failure, 500, 'Failed to record copyright notice')
  return failure
}

function receiptPurpose(
  prefix: TerritorialNoticeReceiptContract['purposePrefix'],
  idempotencyKey: string,
): string {
  const purposePrefix = RECEIPT_PURPOSES[prefix]
  assert(purposePrefix === prefix, 500, 'Failed to record copyright notice')
  return `${purposePrefix}:${idempotencyKey}`
}
