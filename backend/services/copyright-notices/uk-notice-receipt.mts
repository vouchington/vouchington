import type { TransactionQuery } from '@data-stores/psql/types'
import type { PrivateUser } from '@services/users/types'
import type { TerritorialNoticeRequest } from './territorial-fields.mts'
import {
  receiveTerritorialCopyrightNotice,
  receiveTerritorialCopyrightNoticeInTransaction,
  type TerritorialCopyrightNoticeReceipt,
  type TerritorialNoticeReceiptContract,
} from './territorial-notice-receipt.mts'

export type UkCopyrightNoticeReceipt = TerritorialCopyrightNoticeReceipt

const UK_COPYRIGHT_NOTICE_RECEIPT = {
  jurisdiction: 'uk',
  label: 'UK',
  purposePrefix: 'copyright-uk-notice',
  receipts: 'copyright_uk_notice_receipts',
  acknowledgments: 'copyright_uk_notice_acknowledgments',
  routings: 'copyright_uk_notice_routings',
  receiptForeignKey: 'copyright_uk_notice_receipt_id',
} as const satisfies TerritorialNoticeReceiptContract

export async function receiveUkCopyrightNotice(
  actor: PrivateUser,
  idempotencyKey: string,
  request: TerritorialNoticeRequest,
): Promise<UkCopyrightNoticeReceipt> {
  return receiveTerritorialCopyrightNotice(
    actor,
    UK_COPYRIGHT_NOTICE_RECEIPT,
    idempotencyKey,
    request,
  )
}

export async function receiveUkCopyrightNoticeInTransaction(
  actor: PrivateUser,
  idempotencyKey: string,
  request: TerritorialNoticeRequest,
  transaction: TransactionQuery,
): Promise<UkCopyrightNoticeReceipt> {
  return receiveTerritorialCopyrightNoticeInTransaction(
    actor,
    UK_COPYRIGHT_NOTICE_RECEIPT,
    idempotencyKey,
    request,
    transaction,
  )
}
