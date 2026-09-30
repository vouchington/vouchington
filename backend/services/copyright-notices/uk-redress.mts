import type { PrivateUser } from '@services/users/types'
import {
  recordTerritorialCopyrightRedressDecision,
  submitTerritorialCopyrightRedress,
  type TerritorialCopyrightRedressDecision,
  type TerritorialCopyrightRedressRequest,
} from './territorial-redress.mts'

export type UkCopyrightRedressRequest = TerritorialCopyrightRedressRequest
export type UkCopyrightRedressDecision = TerritorialCopyrightRedressDecision

export async function submitUkCopyrightRedress(
  actor: PrivateUser,
  noticeId: string,
  idempotencyKey: string,
  explanation: string,
): Promise<UkCopyrightRedressRequest> {
  return submitTerritorialCopyrightRedress(actor, noticeId, idempotencyKey, explanation, 'uk')
}

export async function recordUkCopyrightRedressDecision(
  actor: PrivateUser,
  noticeId: string,
  redressId: string,
  input: { disposition: unknown; rationale: string },
): Promise<UkCopyrightRedressDecision> {
  return recordTerritorialCopyrightRedressDecision(actor, noticeId, redressId, input, 'uk')
}
