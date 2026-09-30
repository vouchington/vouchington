import type { PrivateUser } from '@services/users/types'
import {
  recordTerritorialCopyrightAcknowledgment,
  type TerritorialAcknowledgmentContract,
  type TerritorialCopyrightAcknowledgment,
} from './territorial-acknowledgment.mts'

export type EuCopyrightAcknowledgment = TerritorialCopyrightAcknowledgment

const EU_COPYRIGHT_ACKNOWLEDGMENT = {
  jurisdiction: 'eu_dsa',
  notFound: 'EU copyright notice not found',
  queryName: 'recordEuAcknowledgment',
  acknowledgments: 'copyright_eu_notice_acknowledgments',
  receipts: 'copyright_eu_notice_receipts',
  receiptForeignKey: 'copyright_eu_notice_receipt_id',
  escalations: 'copyright_eu_escalations',
  acknowledgmentForeignKey: 'copyright_eu_notice_acknowledgment_id',
} as const satisfies TerritorialAcknowledgmentContract

export async function acknowledgeEuCopyrightNotice(
  actor: PrivateUser,
  noticeId: string,
): Promise<EuCopyrightAcknowledgment> {
  return recordTerritorialCopyrightAcknowledgment(
    actor,
    noticeId,
    'acknowledged',
    EU_COPYRIGHT_ACKNOWLEDGMENT,
  )
}

export async function recordEuCopyrightAcknowledgmentFailure(
  actor: PrivateUser,
  noticeId: string,
): Promise<EuCopyrightAcknowledgment> {
  return recordTerritorialCopyrightAcknowledgment(
    actor,
    noticeId,
    'failed',
    EU_COPYRIGHT_ACKNOWLEDGMENT,
  )
}
