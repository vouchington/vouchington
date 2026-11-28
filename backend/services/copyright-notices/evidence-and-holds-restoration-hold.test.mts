import { runWithCapturedQueries } from '@data-stores/psql/query-capture'
import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { getImagePlacementDeliveryKey } from '@ts-shared/url-signing'
import { getImagePlacementForCopyright } from '@services/images/placements'
import {
  appendCopyrightLegalHoldAssessment,
  processCopyrightActionIntent,
  resolveCopyrightLegalHold,
} from './index.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from './restrictions.mts'
import { createEligibleCopyrightRestoreIntent } from './restoration.mts'
import { copyrightSweepConfig } from './work-limits.mts'
import {
  createCompliantCounterNoticeDeadline,
  createCopyrightRestorationHoldFixture,
} from '@voucha/test-helpers/copyright-restoration-hold-fixtures'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

describe('copyright notice restoration holds', () => {
  let edge: ReturnType<typeof installTestMediaDeliveryEdge>

  beforeEach(() => {
    edge = installTestMediaDeliveryEdge()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('re-restricts an exact restored tuple for a hold received before restoration, then restores only after resolution', async () => {
    const { initialWithhold, moderator, notice, restorationAt, restore, restriction, target } =
      await openHeldCounterNoticeRestore()
    await expect(processCopyrightActionIntent(restore.id, restorationAt)).resolves.toBe('applied')
    const holdSubmission = await appendTestCopyrightNoticeSubmission({
      noticeId: notice.id,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date('2026-07-03T12:00:00.000Z'),
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `hold-${crypto.randomUUID()}`,
    })
    const hold = await appendCopyrightLegalHoldAssessment({
      currentUser: moderator,
      submissionId: holdSubmission.id,
      assessedAt: new Date(restorationAt.getTime() + 60_000),
      fromOriginalClaimant: true,
      proceedingKind: 'federal_court',
      ccbClaimKind: null,
      commencedAt: new Date('2026-07-03T11:00:00.000Z'),
      receivedByDesignatedAgentAt: new Date('2026-07-03T12:00:00.000Z'),
      sameMaterial: true,
      targetIds: [target.id],
      rationale: 'Verified qualifying federal court filing.',
    })
    const holdWithhold = (await getCopyrightNoticePrivateAggregate(notice.id))?.actionIntents.find(
      intent => intent.action === 'withhold' && intent.id !== initialWithhold.id,
    )
    await expect(getImagePlacementForCopyright(target.placement_id)).resolves.toEqual(
      expect.objectContaining({
        placementId: target.placement_id.replace('image-placement:', ''),
        revision: target.placement_revision + 3,
        withheld: true,
      }),
    )
    expect(holdWithhold).toEqual(
      expect.objectContaining({
        expected_placement_revision: target.placement_revision + 2,
        state: 'pending',
      }),
    )
    if (!holdWithhold) throw new Error('hold withhold intent disappeared')
    await expect(
      processCopyrightActionIntent(holdWithhold.id, new Date(restorationAt.getTime() + 120_000)),
    ).resolves.toBe('applied')
    await resolveCopyrightLegalHold({
      currentUser: moderator,
      assessmentId: hold.id,
      resolvedAt: new Date(restorationAt.getTime() + 180_000),
      resolutionKind: 'dismissed',
      rationale: `resolution-${crypto.randomUUID()}`,
    })
    const holdRestore = (await getCopyrightNoticePrivateAggregate(notice.id))?.actionIntents.find(
      intent => intent.action === 'restore' && intent.copyright_restriction_id !== restriction.id,
    )
    expect(holdRestore).toEqual(expect.objectContaining({ state: 'pending' }))
    if (!holdRestore) throw new Error('hold restore intent disappeared')
    await expect(
      processCopyrightActionIntent(holdRestore.id, new Date(restorationAt.getTime() + 240_000)),
    ).resolves.toBe('applied')
    const restoredPlacement = await getImagePlacementForCopyright(target.placement_id)
    if (!restoredPlacement) throw new Error('restored placement disappeared')
    expect(
      edge.records.get(
        getImagePlacementDeliveryKey({
          placementId: restoredPlacement.placementId,
          revision: restoredPlacement.revision,
          imageId: restoredPlacement.imageId,
        }),
      )?.state,
    ).toBe('allow')

    const beforeLateReceipt = await getCopyrightNoticePrivateAggregate(notice.id)
    const lateSubmission = await appendTestCopyrightNoticeSubmission({
      noticeId: notice.id,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date(restorationAt.getTime() + 300_000),
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `late-hold-${crypto.randomUUID()}`,
    })
    await appendCopyrightLegalHoldAssessment({
      currentUser: moderator,
      submissionId: lateSubmission.id,
      assessedAt: new Date(restorationAt.getTime() + 360_000),
      fromOriginalClaimant: true,
      proceedingKind: 'federal_court',
      ccbClaimKind: null,
      commencedAt: new Date(restorationAt.getTime() + 299_000),
      receivedByDesignatedAgentAt: new Date(restorationAt.getTime() + 300_000),
      sameMaterial: true,
      targetIds: [target.id],
      rationale: 'Receipt was outside the statutory hold window.',
    })
    const afterLateReceipt = await getCopyrightNoticePrivateAggregate(notice.id)
    expect(afterLateReceipt?.actionIntents).toHaveLength(
      beforeLateReceipt?.actionIntents.length ?? 0,
    )
  })

  it('rolls back a rejected late-hold target without staging a denial or action intent', async () => {
    const { moderator, notice } = await createCopyrightRestorationHoldFixture()
    const submission = await appendTestCopyrightNoticeSubmission({
      noticeId: notice.id,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date('2026-07-03T12:00:00.000Z'),
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `invalid-hold-${crypto.randomUUID()}`,
    })

    await expect(
      appendCopyrightLegalHoldAssessment({
        currentUser: moderator,
        submissionId: submission.id,
        assessedAt: new Date('2026-07-03T12:01:00.000Z'),
        fromOriginalClaimant: true,
        proceedingKind: 'federal_court',
        ccbClaimKind: null,
        commencedAt: new Date('2026-07-03T11:00:00.000Z'),
        receivedByDesignatedAgentAt: new Date('2026-07-03T12:00:00.000Z'),
        sameMaterial: true,
        targetIds: [crypto.randomUUID()],
        rationale: 'Target must belong to this notice.',
      }),
    ).rejects.toMatchObject({ statusCode: 422 })

    const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
    expect(aggregate?.holdAssessments).toEqual([])
    expect(aggregate?.actionIntents).toEqual([])
  })

  it('activates late legal holds in ascending target-id order across chunks and matches single-page results', async () => {
    async function runLateHold(batchSize: number) {
      const { aggregate, assessment, claimant, moderator, notice } =
        await createCopyrightRestorationHoldFixture(3)
      const restrictions = []
      for (const target of aggregate.targets) {
        restrictions.push(
          await acceptCopyrightNoticeAndImposeRestriction({
            noticeId: notice.id,
            targetId: target.id,
            assessmentId: assessment.id,
            imposedAt: new Date('2026-07-01T12:00:00.000Z'),
            imposedById: moderator.id,
          }),
        )
      }
      const initialAggregate = await getCopyrightNoticePrivateAggregate(notice.id)
      const initialWithholdIds = new Set(
        (initialAggregate?.actionIntents ?? [])
          .filter(intent => intent.action === 'withhold')
          .map(intent => intent.id),
      )
      for (const intentId of initialWithholdIds) {
        await expect(processCopyrightActionIntent(intentId, new Date())).resolves.toBe('applied')
      }
      const deadline = await createCompliantCounterNoticeDeadline({
        claimant,
        noticeId: notice.id,
        moderator,
        targetIds: aggregate.targets.map(target => target.id),
      })
      const restorationAt = new Date(deadline.earliest_restoration_at.getTime() + 60_000)
      for (const [index, target] of aggregate.targets.entries()) {
        const restore = await createEligibleCopyrightRestoreIntent({
          noticeId: notice.id,
          targetId: target.id,
          restrictionId: restrictions[index]!.id,
          deadlineId: deadline.id,
          expectedPlacementRevision: target.placement_revision,
          now: restorationAt,
        })
        await expect(processCopyrightActionIntent(restore.id, restorationAt)).resolves.toBe(
          'applied',
        )
      }
      const holdSubmission = await appendTestCopyrightNoticeSubmission({
        noticeId: notice.id,
        kind: 'court_or_ccb_hold',
        receivedAt: new Date('2026-07-03T12:00:00.000Z'),
        sourceKind: 'email',
        submittedByUserId: null,
        bodyCiphertext: `late-hold-multipage-${crypto.randomUUID()}`,
      })
      const sortedTargetIds = aggregate.targets.map(target => target.id).toSorted()
      const unsortedTargetIds = [sortedTargetIds[2]!, sortedTargetIds[0]!, sortedTargetIds[1]!]
      const restoreConfig = overrideDynamicConfigFieldsForTest(copyrightSweepConfig, {
        batch_size: batchSize,
      })
      onTestFinished(restoreConfig)
      try {
        const captured = await runWithCapturedQueries(() =>
          appendCopyrightLegalHoldAssessment({
            currentUser: moderator,
            submissionId: holdSubmission.id,
            assessedAt: new Date(restorationAt.getTime() + 60_000),
            fromOriginalClaimant: true,
            proceedingKind: 'federal_court',
            ccbClaimKind: null,
            commencedAt: new Date('2026-07-03T11:00:00.000Z'),
            receivedByDesignatedAgentAt: new Date('2026-07-03T12:00:00.000Z'),
            sameMaterial: true,
            targetIds: unsortedTargetIds,
            rationale: 'Verified qualifying federal court filing for all targets.',
          }),
        )
        const after = await getCopyrightNoticePrivateAggregate(notice.id)
        const placements = await Promise.all(
          aggregate.targets.map(target => getImagePlacementForCopyright(target.placement_id)),
        )
        const activationChunks = captured.queries
          .filter(query => query.text.includes('activateLateCopyrightLegalHoldRestrictions'))
          .map(query => query.values?.[0] as string[])
        return {
          sortedTargetIds,
          activationChunks,
          activeRestrictionCount:
            after?.restrictions.filter(restriction => restriction.lifted_at === null).length ?? 0,
          newWithholdIntentCount:
            after?.actionIntents.filter(
              intent => intent.action === 'withhold' && !initialWithholdIds.has(intent.id),
            ).length ?? 0,
          withheldFlags: placements.map(placement => placement?.withheld ?? false),
        }
      } finally {
        restoreConfig()
      }
    }

    const multiPage = await runLateHold(2)
    const singlePage = await runLateHold(100)

    expect(multiPage.activationChunks).toEqual([
      [multiPage.sortedTargetIds[0], multiPage.sortedTargetIds[1]],
      [multiPage.sortedTargetIds[2]],
    ])
    expect(singlePage.activationChunks).toEqual([singlePage.sortedTargetIds])
    expect(multiPage.activeRestrictionCount).toBe(3)
    expect(multiPage.newWithholdIntentCount).toBe(3)
    expect(multiPage.activeRestrictionCount).toBe(singlePage.activeRestrictionCount)
    expect(multiPage.newWithholdIntentCount).toBe(singlePage.newWithholdIntentCount)
    expect(multiPage.withheldFlags).toEqual(singlePage.withheldFlags)
    expect(multiPage.withheldFlags).toEqual([true, true, true])
  })
})
