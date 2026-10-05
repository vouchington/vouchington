import type { TerritorialNoticeRequest } from './territorial-fields.mts'
import {
  receiveTerritorialCopyrightNotice,
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
