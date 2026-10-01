import type { TransactionQuery } from '@data-stores/psql/types'
import type { PrivateUser } from '@services/users/types'
import type { TerritorialNoticeRequest } from './territorial-fields.mts'
import {
  receiveTerritorialCopyrightNotice,
  receiveTerritorialCopyrightNoticeInTransaction,
  type TerritorialCopyrightNoticeReceipt,
} from './territorial-notice-receipt.mts'

export type UkCopyrightNoticeReceipt = TerritorialCopyrightNoticeReceipt

export async function receiveUkCopyrightNotice(
  actor: PrivateUser,
  idempotencyKey: string,
  request: TerritorialNoticeRequest,
): Promise<UkCopyrightNoticeReceipt> {
  return receiveTerritorialCopyrightNotice(actor, 'uk', idempotencyKey, request)
}

export async function receiveUkCopyrightNoticeInTransaction(
  actor: PrivateUser,
  idempotencyKey: string,
  request: TerritorialNoticeRequest,
  transaction: TransactionQuery,
): Promise<UkCopyrightNoticeReceipt> {
  return receiveTerritorialCopyrightNoticeInTransaction(
    actor,
    'uk',
    idempotencyKey,
    request,
    transaction,
  )
}
