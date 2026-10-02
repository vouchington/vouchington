import type { PrivateUser } from '@services/users/types'
import {
  recordTerritorialCopyrightAcknowledgment,
  type TerritorialCopyrightAcknowledgment,
} from './territorial-acknowledgment.mts'

export type UkCopyrightAcknowledgment = TerritorialCopyrightAcknowledgment

export async function acknowledgeUkCopyrightNotice(
  actor: PrivateUser,
  noticeId: string,
): Promise<UkCopyrightAcknowledgment> {
  return recordTerritorialCopyrightAcknowledgment(actor, noticeId, 'acknowledged', 'uk')
}

export async function recordUkCopyrightAcknowledgmentFailure(
  actor: PrivateUser,
  noticeId: string,
): Promise<UkCopyrightAcknowledgment> {
  return recordTerritorialCopyrightAcknowledgment(actor, noticeId, 'failed', 'uk')
}
