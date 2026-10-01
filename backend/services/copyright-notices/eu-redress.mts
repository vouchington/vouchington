import type { PrivateUser } from '@services/users/types'
import {
  recordTerritorialCopyrightRedressDecision,
  submitTerritorialCopyrightRedress,
  type TerritorialCopyrightRedressDecision,
  type TerritorialCopyrightRedressRequest,
} from './territorial-redress.mts'

export type EuCopyrightRedressRequest = TerritorialCopyrightRedressRequest
export type EuCopyrightRedressDecision = TerritorialCopyrightRedressDecision

export async function submitEuCopyrightRedress(
  actor: PrivateUser,
  noticeId: string,
  idempotencyKey: string,
  explanation: string,
): Promise<EuCopyrightRedressRequest> {
  return submitTerritorialCopyrightRedress(actor, noticeId, idempotencyKey, explanation, 'eu')
}

export async function recordEuCopyrightRedressDecision(
  actor: PrivateUser,
  noticeId: string,
  redressId: string,
  input: { disposition: unknown; rationale: string },
): Promise<EuCopyrightRedressDecision> {
  return recordTerritorialCopyrightRedressDecision(actor, noticeId, redressId, input, 'eu')
}
