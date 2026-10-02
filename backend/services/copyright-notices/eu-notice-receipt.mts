import type { TransactionQuery } from '@data-stores/psql/types'
import type { PrivateUser } from '@services/users/types'
import type { TerritorialNoticeRequest } from './territorial-fields.mts'
import {
  receiveTerritorialCopyrightNotice,
  receiveTerritorialCopyrightNoticeInTransaction,
  type TerritorialCopyrightNoticeReceipt,
} from './territorial-notice-receipt.mts'

export type EuCopyrightNoticeReceipt = TerritorialCopyrightNoticeReceipt

export async function receiveEuCopyrightNotice(
  actor: PrivateUser,
  idempotencyKey: string,
  request: TerritorialNoticeRequest,
): Promise<EuCopyrightNoticeReceipt> {
  return receiveTerritorialCopyrightNotice(actor, 'eu_dsa', idempotencyKey, request)
}

export async function receiveEuCopyrightNoticeInTransaction(
  actor: PrivateUser,
  idempotencyKey: string,
  request: TerritorialNoticeRequest,
  transaction: TransactionQuery,
): Promise<EuCopyrightNoticeReceipt> {
  return receiveTerritorialCopyrightNoticeInTransaction(
    actor,
    'eu_dsa',
    idempotencyKey,
    request,
    transaction,
  )
}
