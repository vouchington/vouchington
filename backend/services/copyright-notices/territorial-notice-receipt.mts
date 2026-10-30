import { CopyrightReplayAdmission } from './replay-admission.mts'
import {
  decodeTerritorialReceiptSnapshot,
  type TerritorialReceiptSnapshot,
} from './territorial-retained-receipt.mts'
import { preflightCopyrightReplay } from './admission-replay-preflight.mts'
import { findCopyrightReplayIdentity } from './replay-identity-store.mts'
import { recordCopyrightReplayIdentity } from './replay-identity-create.mts'
import { v7 as uuidv7 } from 'uuid'
import {
  prepareCopyrightEncryptionKey,
  attachCopyrightEncryptionKey,
  type PreparedCopyrightEncryptionKey,
} from './encryption-keys.mts'
import { createCopyrightReplayDigest } from './replay-identity-hmac.mts'
import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { lockCurrentCopyrightJurisdictionPolicy } from './jurisdiction-policy.mts'
import {
  assertIdempotencyKey,
  noticeFields,
  territorialRequestSha256,
  type TerritorialCopyrightJurisdiction,
  type TerritorialNoticeRequest,
  type EuTerritorialNoticeRequest,
} from './territorial-fields.mts'
import { createEuCopyrightReceiptDelivery } from './territorial-notice-receipt-delivery.mts'
import { territorialLabels } from './territorial-labels.mts'
import { recordCopyrightTrustedFlaggerMatch } from './trusted-flagger-match.mts'
import {
  insertAcknowledgmentQuery,
  insertReceiptQuery,
  insertRoutingQuery,
} from './territorial-notice-receipt-sql.mts'

export type TerritorialCopyrightNoticeReceipt = TerritorialReceiptSnapshot & {
  is_duplicate: boolean
}

export type TerritorialNoticeRequester = { user: PrivateUser | null; identity: string }

export async function receiveTerritorialCopyrightNotice(
  requester: TerritorialNoticeRequester,
  jurisdiction: TerritorialCopyrightJurisdiction,
  idempotencyKey: string,
  request: TerritorialNoticeRequest | EuTerritorialNoticeRequest,
): Promise<TerritorialCopyrightNoticeReceipt> {
  assertIdempotencyKey(idempotencyKey)
  const fields = noticeFields(request, jurisdiction)
  const preflight = await preflightCopyrightReplay({
    family: 'territorial_notice',
    jurisdiction,
    identity: JSON.stringify([requester.identity, idempotencyKey]),
    requester: requester.identity,
    request: JSON.stringify(fields),
  })
  if (preflight) {
    assert(preflight.liveSnapshot, 404, territorialLabels(jurisdiction).noticeNotFound)
    return { ...decodeTerritorialReceiptSnapshot(preflight.liveSnapshot), is_duplicate: true }
  }
  const noticeId = uuidv7()
  await using key = await prepareCopyrightEncryptionKey('notice')
  await using transaction = await beginTransaction()
  const receipt = await receiveTerritorialCopyrightNoticeInTransaction(
    requester,
    jurisdiction,
    idempotencyKey,
    request,
    transaction,
    { noticeId, key },
  )
  await transaction.commit()
  assert(receipt, 404, territorialLabels(jurisdiction).noticeNotFound)
  return receipt
}

export async function receiveTerritorialCopyrightNoticeInTransaction(
  requester: TerritorialNoticeRequester,
  jurisdiction: TerritorialCopyrightJurisdiction,
  idempotencyKey: string,
  request: TerritorialNoticeRequest | EuTerritorialNoticeRequest,
  transaction: TransactionQuery,
  encryption: { noticeId: string; key: PreparedCopyrightEncryptionKey },
): Promise<TerritorialCopyrightNoticeReceipt | null> {
  assertIdempotencyKey(idempotencyKey)
  const fields = noticeFields(request, jurisdiction)
  const requestSha256 = territorialRequestSha256(fields)
  const identitySha256 = createCopyrightReplayDigest('requester', requester.identity).digest
  const replayInput = {
    family: 'territorial_notice' as const,
    jurisdiction,
    identity: JSON.stringify([requester.identity, idempotencyKey]),
    requester: requester.identity,
    request: JSON.stringify(fields),
  }
  const replayAdmission = await CopyrightReplayAdmission.open(transaction, replayInput)
  const existing = await findCopyrightReplayIdentity(replayAdmission)
  if (existing) {
    const replay = await existing.replay()
    return replay.liveSnapshot
      ? { ...decodeTerritorialReceiptSnapshot(replay.liveSnapshot), is_duplicate: true }
      : null
  }
  const owner = { kind: 'notice' as const, id: encryption.noticeId }
  await attachCopyrightEncryptionKey(encryption.key, owner, transaction)
  const encryptSecret = (value: string, purpose: string) =>
    encryption.key.encrypt(value, purpose, owner)
  const approval = await lockCurrentCopyrightJurisdictionPolicy(jurisdiction, transaction)
  const labels = territorialLabels(jurisdiction)
  const purpose = `${labels.noticePurpose}:${idempotencyKey}`
  const failure = labels.noticeFailed
  const { rows: notices } = await transaction<{ id: string }>(
    sql`/* receiveTerritorialCopyrightNotice:notice */
    INSERT INTO copyright_notices (
      id, jurisdiction, legal_basis, received_at, claimant_user_id, claimant_contact_ciphertext,
      claimant_display_name, work_description, policy_version
    ) VALUES (
      ${encryption.noticeId}, ${jurisdiction}, 'copyright', CURRENT_TIMESTAMP, ${requester.user?.id ?? null},
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
  await recordCopyrightReplayIdentity(replayAdmission, notice.id, 'notice_received', {
    notice_id: notice.id,
    receipt_id: receipt.id,
    acknowledgment_id: acknowledgment.id,
    route_destination: 'staff_queue',
  })
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
