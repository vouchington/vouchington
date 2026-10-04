import type { TransactionQuery } from '@data-stores/psql/types'
import type { TerritorialNoticeRequest } from './territorial-fields.mts'
import {
  receiveTerritorialCopyrightNotice,
  receiveTerritorialCopyrightNoticeInTransaction,
  type TerritorialCopyrightNoticeReceipt,
  type TerritorialNoticeRequester,
} from './territorial-notice-receipt.mts'

export type UkCopyrightNoticeReceipt = TerritorialCopyrightNoticeReceipt

export async function receiveUkCopyrightNotice(
  requester: TerritorialNoticeRequester,
  idempotencyKey: string,
  request: TerritorialNoticeRequest,
): Promise<UkCopyrightNoticeReceipt> {
  return receiveTerritorialCopyrightNotice(requester, 'uk', idempotencyKey, request)
}

export async function receiveUkCopyrightNoticeInTransaction(
  requester: TerritorialNoticeRequester,
  idempotencyKey: string,
  request: TerritorialNoticeRequest,
  transaction: TransactionQuery,
): Promise<UkCopyrightNoticeReceipt> {
  return receiveTerritorialCopyrightNoticeInTransaction(
    requester,
    'uk',
    idempotencyKey,
    request,
    transaction,
  )
}
