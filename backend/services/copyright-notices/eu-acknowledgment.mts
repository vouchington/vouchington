import type { PrivateUser } from '@services/users/types'
import {
  recordTerritorialCopyrightAcknowledgment,
  type TerritorialCopyrightAcknowledgment,
} from './territorial-acknowledgment.mts'

export type EuCopyrightAcknowledgment = TerritorialCopyrightAcknowledgment

export async function acknowledgeEuCopyrightNotice(
  actor: PrivateUser | null,
  noticeId: string,
): Promise<EuCopyrightAcknowledgment> {
  return recordTerritorialCopyrightAcknowledgment(actor, noticeId, 'acknowledged', 'eu_dsa')
}

export async function recordEuCopyrightAcknowledgmentFailure(
  actor: PrivateUser,
  noticeId: string,
): Promise<EuCopyrightAcknowledgment> {
  return recordTerritorialCopyrightAcknowledgment(actor, noticeId, 'failed', 'eu_dsa')
}
