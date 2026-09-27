import type { publishImagePlacementDeliveryRecord } from '@services/media-delivery-safety'
import type { CopyrightActionDeliveryDependencies } from './action-delivery-dependencies.mts'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightLegalHoldAssessment,
  appendCopyrightNoticeSubmission,
  getCopyrightNoticePrivateAggregate,
} from './index.mts'
import {
  createCopyrightRestorationHoldFixture,
  createCounterNoticeRestoreIntent,
  deliverInitialCopyrightWithhold,
} from './evidence-and-holds-restoration-hold-fixtures.mts'

export async function openHeldCounterNoticeRestore(
  dependencies: Partial<CopyrightActionDeliveryDependencies>,
  targetCount = 1,
) {
  const { aggregate, assessment, claimant, moderator, notice } =
    await createCopyrightRestorationHoldFixture(targetCount)
  const target = aggregate.targets[0]!
  const restriction = await acceptCopyrightNoticeAndImposeRestriction({
    noticeId: notice.id,
    targetId: target.id,
    assessmentId: assessment.id,
    imposedAt: new Date('2026-07-01T12:00:00.000Z'),
    imposedById: moderator.id,
  })
  const initialWithhold = (await getCopyrightNoticePrivateAggregate(notice.id))?.actionIntents.find(
    intent => intent.action === 'withhold',
  )
  if (!initialWithhold) throw new Error('initial withhold intent disappeared')
  await deliverInitialCopyrightWithhold(notice.id, dependencies)
  for (const other of aggregate.targets.slice(1)) {
    // oxlint-disable-next-line no-await-in-loop -- each independently reviewed target gets its real restriction.
    await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: other.id,
      assessmentId: assessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      imposedById: moderator.id,
    })
  }
  const opened = await createCounterNoticeRestoreIntent({
    claimant,
    noticeId: notice.id,
    moderator,
    targetId: target.id,
    restrictionId: restriction.id,
    placementRevision: target.placement_revision,
  })
  return {
    claimant,
    moderator,
    notice,
    target,
    restriction,
    initialWithhold,
    restorationAt: opened.now,
    restore: opened.restore,
  }
}

export async function recordOrdinaryCopyrightHold(
  scene: Awaited<ReturnType<typeof openHeldCounterNoticeRestore>>,
  publish: typeof publishImagePlacementDeliveryRecord,
  targetIds: string[] = [scene.target.id],
) {
  const receivedAt = new Date('2026-07-03T12:00:00.000Z')
  const submission = await appendCopyrightNoticeSubmission({
    noticeId: scene.notice.id,
    kind: 'court_or_ccb_hold',
    receivedAt,
    sourceKind: 'email',
    submittedByUserId: null,
    bodyCiphertext: `hold-${crypto.randomUUID()}`,
  })
  return appendCopyrightLegalHoldAssessment({
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
    rationale: 'Verified original claimant proceeding on this target.',
    dependencies: { assertLegalEnforcementEnabled: () => {}, publishPlacement: publish },
  })
}
