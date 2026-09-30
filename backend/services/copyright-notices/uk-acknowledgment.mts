import type { PrivateUser } from '@services/users/types'
import {
  recordTerritorialCopyrightAcknowledgment,
  type TerritorialAcknowledgmentContract,
  type TerritorialCopyrightAcknowledgment,
} from './territorial-acknowledgment.mts'

export type UkCopyrightAcknowledgment = TerritorialCopyrightAcknowledgment

const UK_COPYRIGHT_ACKNOWLEDGMENT = {
  jurisdiction: 'uk',
  notFound: 'UK copyright notice not found',
  queryName: 'recordUkAcknowledgment',
  acknowledgments: 'copyright_uk_notice_acknowledgments',
  receipts: 'copyright_uk_notice_receipts',
  receiptForeignKey: 'copyright_uk_notice_receipt_id',
  escalations: 'copyright_uk_escalations',
  acknowledgmentForeignKey: 'copyright_uk_notice_acknowledgment_id',
} as const satisfies TerritorialAcknowledgmentContract

export async function acknowledgeUkCopyrightNotice(
  actor: PrivateUser,
  noticeId: string,
): Promise<UkCopyrightAcknowledgment> {
  return recordTerritorialCopyrightAcknowledgment(
    actor,
    noticeId,
    'acknowledged',
    UK_COPYRIGHT_ACKNOWLEDGMENT,
  )
}

export async function recordUkCopyrightAcknowledgmentFailure(
  actor: PrivateUser,
  noticeId: string,
): Promise<UkCopyrightAcknowledgment> {
  return recordTerritorialCopyrightAcknowledgment(
    actor,
    noticeId,
    'failed',
    UK_COPYRIGHT_ACKNOWLEDGMENT,
  )
}
