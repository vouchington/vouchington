import { createHash } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { lockCurrentCopyrightJurisdictionPolicy } from './jurisdiction-policy.mts'
import {
  assertIdempotencyKey,
  noticeFields,
  sameSha256,
  territorialRequestSha256,
  type TerritorialCopyrightJurisdiction,
  type TerritorialNoticeRequest,
  type EuTerritorialNoticeRequest,
} from './territorial-fields.mts'
import { createEuCopyrightReceiptDelivery } from './territorial-notice-receipt-delivery.mts'
import { territorialLabels } from './territorial-labels.mts'
import { recordCopyrightTrustedFlaggerMatch } from './trusted-flagger-match.mts'
import {
  existingReceiptQuery,
  insertAcknowledgmentQuery,
  insertReceiptQuery,
  insertRoutingQuery,
} from './territorial-notice-receipt-sql.mts'

export type TerritorialCopyrightNoticeReceipt = {
  notice_id: string
  receipt_id: string
  acknowledgment_id: string
  route_destination: 'staff_queue'
  is_duplicate: boolean
}

export type TerritorialNoticeRequester = { user: PrivateUser | null; identity: string }

type TerritorialReceiptRow = {
  request_sha256: Uint8Array
  response_snapshot: unknown
}

function decodeTerritorialReceiptSnapshot(
  value: unknown,
): Omit<TerritorialCopyrightNoticeReceipt, 'is_duplicate'> {
  assert(
    value && typeof value === 'object' && !Array.isArray(value),
    500,
    'Invalid retained territorial receipt',
  )
  const snapshot = value as Record<string, unknown>
  assert(
    typeof snapshot.notice_id === 'string' &&
      typeof snapshot.receipt_id === 'string' &&
      typeof snapshot.acknowledgment_id === 'string' &&
      snapshot.route_destination === 'staff_queue',
    500,
    'Invalid retained territorial receipt',
  )
  return {
    notice_id: snapshot.notice_id,
    receipt_id: snapshot.receipt_id,
    acknowledgment_id: snapshot.acknowledgment_id,
    route_destination: snapshot.route_destination,
  }
}

export async function receiveTerritorialCopyrightNotice(
  requester: TerritorialNoticeRequester,
  jurisdiction: TerritorialCopyrightJurisdiction,
  idempotencyKey: string,
  request: TerritorialNoticeRequest | EuTerritorialNoticeRequest,
): Promise<TerritorialCopyrightNoticeReceipt> {
  await using transaction = await beginTransaction()
  const receipt = await receiveTerritorialCopyrightNoticeInTransaction(
    requester,
    jurisdiction,
    idempotencyKey,
    request,
    transaction,
  )
  await transaction.commit()
  return receipt
}

export async function receiveTerritorialCopyrightNoticeInTransaction(
  requester: TerritorialNoticeRequester,
  jurisdiction: TerritorialCopyrightJurisdiction,
  idempotencyKey: string,
  request: TerritorialNoticeRequest | EuTerritorialNoticeRequest,
  transaction: TransactionQuery,
): Promise<TerritorialCopyrightNoticeReceipt> {
  assertIdempotencyKey(idempotencyKey)
  const fields = noticeFields(request, jurisdiction)
  const requestSha256 = territorialRequestSha256(fields)
  const identitySha256 = createHash('sha256').update(requester.identity).digest()
  await transaction(sql`/* receiveTerritorialCopyrightNotice:lock */
    SELECT pg_advisory_xact_lock(hashtextextended(${`${identitySha256.toString('hex')}:${idempotencyKey}`}, 0))
  `)
  const { rows: existingRows } = await transaction<TerritorialReceiptRow>(
    existingReceiptQuery(jurisdiction, identitySha256, idempotencyKey),
  )
  const existing = existingRows[0]
  if (existing) {
    assert(
      sameSha256(existing.request_sha256, requestSha256),
      409,
      'Idempotency-Key was reused for a different request',
    )
    return { ...decodeTerritorialReceiptSnapshot(existing.response_snapshot), is_duplicate: true }
  }
  const approval = await lockCurrentCopyrightJurisdictionPolicy(jurisdiction, transaction)
  const labels = territorialLabels(jurisdiction)
  const purpose = `${labels.noticePurpose}:${idempotencyKey}`
  const failure = labels.noticeFailed
  const { rows: notices } = await transaction<{ id: string }>(
    sql`/* receiveTerritorialCopyrightNotice:notice */
    INSERT INTO copyright_notices (
      jurisdiction, legal_basis, received_at, claimant_user_id, claimant_contact_ciphertext,
      claimant_display_name, work_description, policy_version
    ) VALUES (
      ${jurisdiction}, 'copyright', CURRENT_TIMESTAMP, ${requester.user?.id ?? null},
      ${encryptSecret(fields.contact, `${purpose}:contact`)},
      ${'notifierName' in fields ? fields.notifierName : null},
      ${fields.contentDescription}, ${approval.policy_version}
    )
    RETURNING id
  `,
  )
  const notice = notices[0]
  assert(notice, 500, failure)
  if (jurisdiction === 'eu_dsa') await recordCopyrightTrustedFlaggerMatch(notice.id, transaction)
  const { rows: receipts } = await transaction<{ id: string }>(
    insertReceiptQuery(
      jurisdiction,
      notice.id,
      approval.id,
      requester.user?.id ?? null,
      identitySha256,
      idempotencyKey,
      requestSha256,
      fields.hostedUseUrl,
      encryptSecret(fields.grounds, `${purpose}:grounds`),
      'notifierEmail' in fields
        ? encryptSecret(fields.notifierEmail, `${purpose}:notifier_email`)
        : null,
      'goodFaithStatement' in fields ? fields.goodFaithStatement : null,
    ),
  )
  const receipt = receipts[0]
  assert(receipt, 500, failure)
  await transaction(insertRoutingQuery(receipt.id))
  const { rows: acknowledgments } = await transaction<{ id: string }>(
    insertAcknowledgmentQuery(receipt.id),
  )
  const acknowledgment = acknowledgments[0]
  assert(acknowledgment, 500, failure)
  await transaction(sql`/* receiveTerritorialCopyrightNotice:retainReplayIdentity */
    INSERT INTO copyright_territorial_notice_retained_identities (
      receipt_id, jurisdiction, requester_identity_sha256, idempotency_key,
      request_sha256, response_snapshot
    ) VALUES (
      ${receipt.id}, ${jurisdiction}, ${identitySha256}, ${idempotencyKey},
      ${requestSha256}, jsonb_build_object('notice_id', ${notice.id}::text,
        'receipt_id', ${receipt.id}::text, 'acknowledgment_id', ${acknowledgment.id}::text,
        'route_destination', 'staff_queue')
    )`)
  if ('notifierEmail' in fields)
    await createEuCopyrightReceiptDelivery(
      {
        noticeId: notice.id,
        notifierEmail: fields.notifierEmail,
        requesterUserId: requester.user?.id ?? null,
      },
      transaction,
    )
  return {
    notice_id: notice.id,
    receipt_id: receipt.id,
    acknowledgment_id: acknowledgment.id,
    route_destination: 'staff_queue',
    is_duplicate: false,
  }
}
