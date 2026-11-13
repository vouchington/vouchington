import { openHeldCounterNoticeRestore } from './copyright-restoration-hold-scene.mts'
import {
  seedFilingBlockedRestore,
  seedAssessedFilingReplay,
} from './copyright-filing-replay-fixture.mts'
import { assertSurfaceRestoreOutcome } from './copyright-surface-restore-outcome.mts'
import { recordCourtFiling } from './copyright-unassessed-filing-scenes.mts'
import { assertNonqualifyingFilingOutcome } from './copyright-unassessed-filing-outcomes.mts'
import { seedEvidenceHold } from './copyright-evidence-hold-fixture.mts'

/** Three independent subjects each run once against complete committed prerequisites. */
export async function assertFilingBlockedReplayDelivery() {
  const blocked = await openHeldCounterNoticeRestore()
  await recordCourtFiling(blocked.notice.id)
  await assertSurfaceRestoreOutcome({
    noticeId: blocked.notice.id,
    restrictionId: blocked.restriction.id,
    placementId: blocked.target.placement_id,
    restoreId: blocked.restore.id,
    now: blocked.restorationAt,
    deliveries: [],
    outcome: 'blocked',
  })

  // The replay subject has a committed blocked intent regardless of the worker result above.
  const replay = await openHeldCounterNoticeRestore()
  const replayFiling = await recordCourtFiling(replay.notice.id)
  await seedFilingBlockedRestore(replay.notice.id)
  await assertNonqualifyingFilingOutcome(
    replay.notice.id,
    {
      currentUser: replay.moderator,
      submissionId: replayFiling.id,
      assessedAt: new Date(replay.restorationAt.getTime() + 60_000),
      fromOriginalClaimant: false,
      proceedingKind: null,
      ccbClaimKind: null,
      commencedAt: null,
      receivedByDesignatedAgentAt: null,
      sameMaterial: false,
      targetIds: [replay.target.id],
      rationale: 'The filing does not identify a commenced proceeding.',
    },
    replay.restore.id,
  )

  // Delivery also always runs, from its own fully assessed and reopened canonical intent.
  const delivery = await openHeldCounterNoticeRestore()
  const deliveryFiling = await recordCourtFiling(delivery.notice.id)
  await seedFilingBlockedRestore(delivery.notice.id)
  const now = new Date(delivery.restorationAt.getTime() + 120_000)
  await seedEvidenceHold({
    noticeId: delivery.notice.id,
    currentUser: delivery.moderator,
    submissionId: deliveryFiling.id,
    assessedAt: now,
    fromOriginalClaimant: false,
    proceedingKind: null,
    ccbClaimKind: null,
    commencedAt: null,
    receivedByDesignatedAgentAt: null,
    sameMaterial: false,
    targetIds: [delivery.target.id],
    rationale: 'The filing does not identify a commenced proceeding.',
  })
  await seedAssessedFilingReplay(delivery.notice.id, now)
  await assertSurfaceRestoreOutcome({
    noticeId: delivery.notice.id,
    restrictionId: delivery.restriction.id,
    placementId: delivery.target.placement_id,
    restoreId: delivery.restore.id,
    deadlineId: delivery.restore.copyright_notice_deadline_id!,
    incidentAccountIds: [delivery.claimant.id],
    now,
    deliveries: [
      `poster_restoration_notice:email:${delivery.claimant.id}`,
      `poster_restoration_notice:in_app:${delivery.claimant.id}`,
    ],
    outcome: 'visible',
  })
}
