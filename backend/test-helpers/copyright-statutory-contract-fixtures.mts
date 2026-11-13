import { beginTransaction } from '@data-stores/psql'
import { appendTestCopyrightNoticeSubmission } from './copyright-notice-submissions.mts'
import { seedEvidenceHold, seedEvidenceHoldResolution } from './copyright-evidence-hold-fixture.mts'
import {
  prepareActionDeliveryRestore,
  type ActionDeliveryScene,
} from './copyright-action-delivery-contract-fixtures.mts'
import {
  completeCopyrightActionIntentInTransaction,
  insertCopyrightActionLifecycleEvent,
} from '../services/copyright-notices/action-delivery-locking.mts'
import { syncCopyrightIncidentsAfterStatutoryRestoreInTransaction } from '../services/copyright-notices/statutory-restoration-incidents.mts'
import { invalidateCopyrightPlacementCache } from '../services/copyright-notices/action-delivery-cache.mts'
import { publishStagedMediaDeliveryRecord } from '../services/media-delivery-safety/index.mts'

/** Every completed statutory effect precedes independent incident/staydown/wording probes in RC. */
export async function seedCompletedStatutoryContract(scene: ActionDeliveryScene) {
  const prepared = await prepareActionDeliveryRestore(scene)
  await using query = await beginTransaction()
  await insertCopyrightActionLifecycleEvent(
    prepared.legal,
    scene.restore.id,
    'placement_restored',
    query,
  )
  await completeCopyrightActionIntentInTransaction({
    intentId: scene.restore.id,
    leaseToken: prepared.legal.lease_token,
    outcome: 'completed',
    completedAt: scene.restorationAt,
    query,
  })
  await syncCopyrightIncidentsAfterStatutoryRestoreInTransaction(prepared.legal, query)
  await invalidateCopyrightPlacementCache(scene.target.placement_id, query)
  await query.commit()
  await publishStagedMediaDeliveryRecord(prepared.mediaDeliveryRegistryRecordId)
  return prepared
}

/** Already admitted ordinary holds are prerequisites of restoration, not competing hold-assessment requests. */
export async function seedStatutoryContractHold(
  scene: ActionDeliveryScene,
  targetIds = [scene.target.id],
) {
  const receivedAt = new Date('2026-07-03T12:00:00.000Z')
  const submission = await appendTestCopyrightNoticeSubmission({
    noticeId: scene.notice.id,
    kind: 'court_or_ccb_hold',
    receivedAt,
    sourceKind: 'email',
    submittedByUserId: null,
    bodyCiphertext: `hold-${crypto.randomUUID()}`,
  })
  return seedEvidenceHold({
    noticeId: scene.notice.id,
    currentUser: scene.moderator,
    submissionId: submission.id,
    assessedAt: receivedAt,
    fromOriginalClaimant: true,
    proceedingKind: 'federal_court',
    ccbClaimKind: null,
    commencedAt: new Date('2026-07-03T11:00:00.000Z'),
    receivedByDesignatedAgentAt: receivedAt,
    sameMaterial: true,
    targetIds,
    rationale: 'Verified original claimant proceeding on these targets.',
  })
}

export function seedStatutoryContractHoldResolution(
  scene: ActionDeliveryScene,
  assessmentId: string,
) {
  return seedEvidenceHoldResolution({
    noticeId: scene.notice.id,
    currentUser: scene.moderator,
    assessmentId,
    resolvedAt: scene.restorationAt,
    resolutionKind: 'dismissed',
    rationale: 'The proceeding ended.',
  })
}
