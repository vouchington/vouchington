import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { TerritorialCopyrightJurisdiction } from './territorial-fields.mts'

export type TerritorialNoticeReceiptContract =
  | {
      jurisdiction: Extract<TerritorialCopyrightJurisdiction, 'eu_dsa'>
      label: 'EU'
      purposePrefix: 'copyright-eu-notice'
      receipts: 'copyright_eu_notice_receipts'
      acknowledgments: 'copyright_eu_notice_acknowledgments'
      routings: 'copyright_eu_notice_routings'
      receiptForeignKey: 'copyright_eu_notice_receipt_id'
    }
  | {
      jurisdiction: Extract<TerritorialCopyrightJurisdiction, 'uk'>
      label: 'UK'
      purposePrefix: 'copyright-uk-notice'
      receipts: 'copyright_uk_notice_receipts'
      acknowledgments: 'copyright_uk_notice_acknowledgments'
      routings: 'copyright_uk_notice_routings'
      receiptForeignKey: 'copyright_uk_notice_receipt_id'
    }

const RECEIPT_IDENTIFIERS = {
  copyright_eu_notice_receipts: 'copyright_eu_notice_receipts',
  copyright_uk_notice_receipts: 'copyright_uk_notice_receipts',
  copyright_eu_notice_acknowledgments: 'copyright_eu_notice_acknowledgments',
  copyright_uk_notice_acknowledgments: 'copyright_uk_notice_acknowledgments',
  copyright_eu_notice_routings: 'copyright_eu_notice_routings',
  copyright_uk_notice_routings: 'copyright_uk_notice_routings',
  copyright_eu_notice_receipt_id: 'copyright_eu_notice_receipt_id',
  copyright_uk_notice_receipt_id: 'copyright_uk_notice_receipt_id',
} as const

type ReceiptIdentifier = keyof typeof RECEIPT_IDENTIFIERS

export function existingReceiptQuery(
  contract: TerritorialNoticeReceiptContract,
  actorId: string,
  idempotencyKey: string,
) {
  return sql`/* receiveTerritorialCopyrightNotice:existing */
    SELECT receipt.copyright_notice_id AS notice_id, receipt.id AS receipt_id,
      receipt.request_sha256, acknowledgment.id AS acknowledgment_id,
      routing.destination AS route_destination
    FROM `
    .append(receiptIdentifier(contract.receipts))
    .append(` receipt JOIN `)
    .append(receiptIdentifier(contract.acknowledgments))
    .append(` acknowledgment ON acknowledgment.`)
    .append(receiptIdentifier(contract.receiptForeignKey))
    .append(` = receipt.id JOIN `)
    .append(receiptIdentifier(contract.routings))
    .append(` routing ON routing.`)
    .append(receiptIdentifier(contract.receiptForeignKey))
    .append(` = receipt.id WHERE receipt.requester_user_id = `)
    .append(sql`${actorId} AND receipt.idempotency_key = ${idempotencyKey}`)
}

export function insertReceiptQuery(
  contract: TerritorialNoticeReceiptContract,
  noticeId: string,
  approvalId: string,
  actorId: string,
  idempotencyKey: string,
  requestSha256: Buffer,
  hostedUseUrl: string,
  groundsCiphertext: string,
) {
  return sql`/* receiveTerritorialCopyrightNotice:receipt */
    INSERT INTO `
    .append(receiptIdentifier(contract.receipts))
    .append(
      ` (
      copyright_notice_id, copyright_territorial_policy_approval_id, requester_user_id,
      idempotency_key, request_sha256, hosted_use_url, grounds_ciphertext
    ) VALUES (`,
    )
    .append(
      sql`${noticeId}, ${approvalId}, ${actorId}, ${idempotencyKey}, ${requestSha256},
      ${hostedUseUrl}, ${groundsCiphertext}`,
    )
    .append(`) RETURNING id`)
}

export function insertRoutingQuery(contract: TerritorialNoticeReceiptContract, receiptId: string) {
  return sql`/* receiveTerritorialCopyrightNotice:routing */
    INSERT INTO `
    .append(receiptIdentifier(contract.routings))
    .append(` (`)
    .append(receiptIdentifier(contract.receiptForeignKey))
    .append(`, destination) VALUES (`)
    .append(sql`${receiptId}, 'staff_queue'`)
    .append(`)`)
}

export function insertAcknowledgmentQuery(
  contract: TerritorialNoticeReceiptContract,
  receiptId: string,
) {
  return sql`/* receiveTerritorialCopyrightNotice:acknowledgment */
    INSERT INTO `
    .append(receiptIdentifier(contract.acknowledgments))
    .append(` (`)
    .append(receiptIdentifier(contract.receiptForeignKey))
    .append(`) VALUES (`)
    .append(sql`${receiptId}`)
    .append(`) RETURNING id`)
}

function receiptIdentifier(identifier: ReceiptIdentifier): string {
  const literal = RECEIPT_IDENTIFIERS[identifier]
  assert(literal === identifier, 500, 'Failed to record copyright notice')
  return literal
}
