import type { EuTerritorialNoticeRequest } from './territorial-fields.mts'
import {
  receiveTerritorialCopyrightNotice,
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
