import { beginTransaction } from '@data-stores/psql'
import {
  lockTerritorialAcknowledgmentQuery,
  updateTerritorialAcknowledgmentQuery,
} from '../services/copyright-notices/territorial-acknowledgment-sql.mts'
import {
  lockCopyrightNoticeForLegalWrite,
  advanceCopyrightLastLegalActivityAt,
} from '../services/copyright-notices/last-legal-activity.mts'
import type { TerritorialCopyrightAcknowledgment } from '../services/copyright-notices/territorial-acknowledgment.mts'

/** A complete committed receipt acknowledgment for downstream staff projection/reopening subjects. */
export async function seedCommittedTerritorialAcknowledgment(
  jurisdiction: 'eu_dsa' | 'uk',
  noticeId: string,
) {
  await using transaction = await beginTransaction()
  const notice = await lockCopyrightNoticeForLegalWrite(transaction, noticeId)
  const { rows } = await transaction<TerritorialCopyrightAcknowledgment>(
    lockTerritorialAcknowledgmentQuery(jurisdiction, noticeId),
  )
  const current = rows[0]
  if (!notice || !current || current.acknowledged_at || current.exhausted_at)
    throw new Error('Owned territorial acknowledgment prerequisite is not pending')
  const { rows: updated } = await transaction<TerritorialCopyrightAcknowledgment>(
    updateTerritorialAcknowledgmentQuery(current.id, 'acknowledged'),
  )
  if (!updated[0]?.acknowledged_at)
    throw new Error('Owned acknowledgment did not commit its receipt')
  await advanceCopyrightLastLegalActivityAt(transaction, notice)
  await transaction.commit()
  return updated[0]
}
