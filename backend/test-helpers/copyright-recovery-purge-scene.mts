import { beginTransaction } from '@data-stores/psql'
import { openHeldCounterNoticeRestore } from './copyright-restoration-hold-scene.mts'
import { readTestRepeatInfringerIncidents } from './copyright-repeat-infringer.mts'
import { recordCopyrightRepeatInfringerDisposition } from '../services/copyright-notices/repeat-infringer-incidents.mts'
import {
  claimCopyrightActionIntent,
  completeCopyrightActionIntentInTransaction,
  liftCopyrightRestrictionInTransaction,
} from '../services/copyright-notices/action-delivery-state.mts'
import { resolveCopyrightDeadlineIfComplete } from '../services/copyright-notices/action-delivery-finalization.mts'
import { sendAllCopyrightDeliveries } from './services/copyright-notices/retention-deliveries.mts'
import { publishCopyrightCasePurgeCoverage } from './services/copyright-notices/retention-case-purge-fixture.mts'

/** A blocked restore remains recoverable after its restriction and deadline have settled. */
export async function createCopyrightRecoveryPurgeScene() {
  const scene = await openHeldCounterNoticeRestore()
  const claim = await claimCopyrightActionIntent(scene.restore.id, scene.restorationAt)
  if (!claim) throw new Error('Recovery fixture restore could not be claimed')
  await using transaction = await beginTransaction()
  await completeCopyrightActionIntentInTransaction({
    intentId: scene.restore.id,
    leaseToken: claim.lease_token,
    outcome: 'blocked',
    completedAt: scene.restorationAt,
    query: transaction,
  })
  await liftCopyrightRestrictionInTransaction(
    scene.restriction.id,
    scene.restorationAt,
    transaction,
  )
  await resolveCopyrightDeadlineIfComplete(
    scene.restore.copyright_notice_deadline_id,
    scene.restorationAt,
    transaction,
  )
  await transaction.commit()
  const incidents = await readTestRepeatInfringerIncidents(scene.claimant.id)
  const incident = incidents.find(
    row => row.copyright_notice_id === scene.notice.id && row.is_operative,
  )
  if (incident) {
    await recordCopyrightRepeatInfringerDisposition({
      currentUser: scene.moderator,
      incidentId: incident.id,
      disposition: 'duplicate',
      rationale: 'Synthetic duplicate disposition permits owned retention testing.',
      recordedAt: scene.restorationAt,
    })
  }
  await sendAllCopyrightDeliveries(scene.notice.id)
  await publishCopyrightCasePurgeCoverage(scene.notice.id)
  return scene
}
