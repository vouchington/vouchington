import type { OwnedTransaction } from '@data-stores/psql'
import type { LockedCopyrightActionDelivery } from './action-delivery-locking-types.mts'
import { syncCopyrightRepeatInfringerIncidents } from './repeat-infringer-incidents.mts'

/**
 * A restore authorized by a counter-notice deadline is a statutory restoration. Once its intent is
 * `completed` the restriction stops counting as a repeat-infringer incident, so the incident sync
 * runs in the completing transaction. Call this after the completion write so the sync sees it.
 * Reversal restores carry no deadline: their confirmation consequences sync at the reversal.
 */
export async function syncCopyrightIncidentsAfterStatutoryRestoreInTransaction(
  legal: Pick<
    LockedCopyrightActionDelivery,
    'action' | 'copyright_notice_id' | 'copyright_notice_deadline_id'
  >,
  transaction: OwnedTransaction,
): Promise<void> {
  if (legal.action !== 'restore' || !legal.copyright_notice_deadline_id) return
  await syncCopyrightRepeatInfringerIncidents(legal.copyright_notice_id, transaction)
}
