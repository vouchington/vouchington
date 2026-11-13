import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  appendTestCopyrightNoticeSubmission,
  seedCopyrightSubmissionAssessment,
} from './copyright-notice-submissions.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import {
  claimActionDeliveryFixture,
  prepareActionDeliveryRestore,
  type ActionDeliveryScene,
} from './copyright-action-delivery-contract-fixtures.mts'
import { seedEvidenceHold } from './copyright-evidence-hold-fixture.mts'
import { prepublishCopyrightImagePlacementDenial } from '../services/copyright-notices/action-delivery-edge.mts'
import { preemptCopyrightRestorations } from '../services/copyright-notices/restore-preemption.mts'
import {
  replayEligibleCopyrightRestoreIntentsInTransaction,
  selectBlockedCopyrightRestoreIntentIds,
} from '../services/copyright-notices/court-hold-restore-replay.mts'

export async function seedOrdinaryClaimedRestore(scene: ActionDeliveryScene) {
  await using query = await beginTransaction()
  const legal = await claimActionDeliveryFixture(scene.restore.id, query)
  await query.commit()
  return legal.lease_token
}

/** An interrupted publication is complete committed legal preparation plus fail-closed denial and a released claim. */
export async function seedOrdinaryInterruptedRestore(scene: ActionDeliveryScene) {
  const prepared = await prepareActionDeliveryRestore(scene)
  await prepublishCopyrightImagePlacementDenial(prepared)
  await using query = await beginTransaction()
  const { rowCount } = await query(sql`/* seedOrdinaryInterruptedRestore */
    UPDATE copyright_notice_action_work_items SET leased_at = NULL, available_at = ${new Date(scene.restorationAt.getTime() + 60_000)},
      failure_message = 'External publication unavailable.'
    WHERE id = ${scene.restore.id} AND state = 'claimed' AND lease_token = ${prepared.legal.lease_token}::uuid`)
  if (rowCount !== 1) throw new Error('Owned interrupted restoration lost its claim')
  await query.commit()
  return prepared
}

export async function seedOrdinaryUnassessedFiling(scene: ActionDeliveryScene, preempt = false) {
  const filing = await appendTestCopyrightNoticeSubmission({
    noticeId: scene.notice.id,
    kind: 'court_or_ccb_hold',
    receivedAt: scene.restorationAt,
    sourceKind: 'email',
    submittedByUserId: null,
    bodyCiphertext: `filing-${crypto.randomUUID()}`,
  })
  if (preempt) {
    await using query = await beginTransaction()
    await preemptCopyrightRestorations(scene.notice.id, query)
    await query.commit()
  }
  return filing
}

/** The real counter-assessment chain is superseded before the independent hold/replay probe. */
export async function seedOrdinaryCounterSuperseded(scene: ActionDeliveryScene, at: Date) {
  const aggregate = await getCopyrightNoticePrivateAggregate(scene.notice.id)
  const deadline = aggregate!.deadlines.find(
    row => row.id === scene.restore.copyright_notice_deadline_id,
  )!
  const assessment = aggregate!.assessments.find(
    row => row.id === deadline.qualifying_counter_notice_assessment_identity_id,
  )!
  await seedCopyrightSubmissionAssessment({
    submissionId: assessment.copyright_notice_submission_id,
    assessedAt: at,
    currentUser: scene.moderator,
    substantiallyCompliant: false,
    supersedesAssessmentId: assessment.id,
  })
}

/** A committed nonqualifying assessment must perform the same current-authority replay as the request. */
export async function seedOrdinaryNonqualifyingFiling(
  scene: ActionDeliveryScene,
  filingId: string,
  at: Date,
) {
  await seedEvidenceHold({
    noticeId: scene.notice.id,
    currentUser: scene.moderator,
    submissionId: filingId,
    assessedAt: at,
    fromOriginalClaimant: false,
    proceedingKind: null,
    ccbClaimKind: null,
    commencedAt: null,
    receivedByDesignatedAgentAt: null,
    sameMaterial: false,
    targetIds: [scene.target.id],
    rationale: 'No qualifying proceeding exists.',
  })
  await using query = await beginTransaction()
  await replayEligibleCopyrightRestoreIntentsInTransaction({
    noticeId: scene.notice.id,
    intentIds: await selectBlockedCopyrightRestoreIntentIds(scene.notice.id, query),
    now: at,
    query,
  })
  await query.commit()
}
