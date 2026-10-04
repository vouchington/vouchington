import type { TransactionQuery } from '@data-stores/psql/types'
import type { EuTerritorialNoticeRequest } from './territorial-fields.mts'
import {
  receiveTerritorialCopyrightNotice,
  receiveTerritorialCopyrightNoticeInTransaction,
  type TerritorialCopyrightNoticeReceipt,
  type TerritorialNoticeRequester,
} from './territorial-notice-receipt.mts'

export type EuCopyrightNoticeReceipt = TerritorialCopyrightNoticeReceipt

export async function receiveEuCopyrightNotice(
  requester: TerritorialNoticeRequester,
  idempotencyKey: string,
  request: EuTerritorialNoticeRequest,
): Promise<EuCopyrightNoticeReceipt> {
  return receiveTerritorialCopyrightNotice(requester, 'eu_dsa', idempotencyKey, request)
}

export async function receiveEuCopyrightNoticeInTransaction(
  requester: TerritorialNoticeRequester,
  idempotencyKey: string,
  request: EuTerritorialNoticeRequest,
  transaction: TransactionQuery,
): Promise<EuCopyrightNoticeReceipt> {
  return receiveTerritorialCopyrightNoticeInTransaction(
    requester,
    'eu_dsa',
    idempotencyKey,
    request,
    transaction,
  )
}
