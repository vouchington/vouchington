import type { TransactionQuery } from '@data-stores/psql/types'
import type { PrivateUser } from '@services/users/types'
import type { TerritorialNoticeRequest } from './territorial-fields.mts'
import {
  receiveTerritorialCopyrightNotice,
  receiveTerritorialCopyrightNoticeInTransaction,
  type TerritorialCopyrightNoticeReceipt,
  type TerritorialNoticeReceiptContract,
} from './territorial-notice-receipt.mts'

export type EuCopyrightNoticeReceipt = TerritorialCopyrightNoticeReceipt

const EU_COPYRIGHT_NOTICE_RECEIPT = {
  jurisdiction: 'eu_dsa',
  label: 'EU',
  purposePrefix: 'copyright-eu-notice',
  receipts: 'copyright_eu_notice_receipts',
  acknowledgments: 'copyright_eu_notice_acknowledgments',
  routings: 'copyright_eu_notice_routings',
  receiptForeignKey: 'copyright_eu_notice_receipt_id',
} as const satisfies TerritorialNoticeReceiptContract

export async function receiveEuCopyrightNotice(
  actor: PrivateUser,
  idempotencyKey: string,
  request: TerritorialNoticeRequest,
): Promise<EuCopyrightNoticeReceipt> {
  return receiveTerritorialCopyrightNotice(
    actor,
    EU_COPYRIGHT_NOTICE_RECEIPT,
    idempotencyKey,
    request,
  )
}

export async function receiveEuCopyrightNoticeInTransaction(
  actor: PrivateUser,
  idempotencyKey: string,
  request: TerritorialNoticeRequest,
  transaction: TransactionQuery,
): Promise<EuCopyrightNoticeReceipt> {
  return receiveTerritorialCopyrightNoticeInTransaction(
    actor,
    EU_COPYRIGHT_NOTICE_RECEIPT,
    idempotencyKey,
    request,
    transaction,
  )
}
