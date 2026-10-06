import { readTestCopyrightStatementIntents } from '@voucha/test-helpers/copyright-statement-notices'
import { describe, expect, it } from 'vitest'
import { createTestCopyrightDeliveryDependencies } from '@voucha/test-helpers/copyright-delivery-dependencies'
import type { CopyrightImagePlacement } from '@services/images/placements'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  processCopyrightActionIntent,
} from './index.mts'
import { createCopyrightRestorationHoldFixture } from './evidence-and-holds-restoration-hold-fixtures.mts'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

describe('copyright action delivery branches', () => {
  it('marks a withhold stale when the placement transition is no longer current', async () => {
    const { aggregate, assessment, moderator, notice } =
      await createCopyrightRestorationHoldFixture()
    const target = aggregate.targets[0]!
    await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: assessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      imposedById: moderator.id,
    })
    const withhold = (await getActionIntent(notice.id, 'withhold'))!
    const placement = currentPlacement(target)
    await expect(
      processCopyrightActionIntent(withhold.id, new Date(), {
        getImagePlacementForCopyright: async () => placement,
        withholdImagePlacementForCopyright: async () => ({ status: 'stale', placement }),
        ...createTestCopyrightDeliveryDependencies(async () => undefined),
      }),
    ).resolves.toBe('stale')
  })

  it('completes an unavailable restore without projecting a deleted placement', async () => {
    const { aggregate, assessment, claimant, moderator, notice } =
      await createCopyrightRestorationHoldFixture()
    const target = aggregate.targets[0]!
    const restriction = await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: assessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      imposedById: moderator.id,
    })
    const restore = await createRestoreIntent({
      claimant,
      moderator,
      noticeId: notice.id,
      restrictionId: restriction.id,
      target,
    })
    await expect(
      processCopyrightActionIntent(restore.id, restore.now, {
        getImagePlacementForCopyright: async () => ({ ...currentPlacement(target), deleted: true }),
        clearUnavailableImagePlacementCopyrightWithholding: async () => undefined,
        ...createTestCopyrightDeliveryDependencies(async () => undefined),
      }),
    ).resolves.toBe('applied')
    const statements = (await readTestCopyrightStatementIntents(notice.id)).filter(
      row => row.delivery_kind === 'poster_restoration_notice',
    )
    expect(statements).toHaveLength(2)
    expect(statements.find(row => row.channel === 'email')?.text).toContain(
      'The image is unavailable.',
    )
    expect(statements.find(row => row.channel === 'email')?.text).toContain(
      'ended automatically when the counter-notice waiting period expired',
    )
    expect(statements.find(row => row.channel === 'email')?.text).not.toContain(
      'A person made this decision',
    )
    await processCopyrightActionIntent(restore.id, restore.now, {
      ...createTestCopyrightDeliveryDependencies(async () => undefined),
    })
    expect(
      (await readTestCopyrightStatementIntents(notice.id)).filter(
        row => row.delivery_kind === 'poster_restoration_notice',
      ),
    ).toHaveLength(2)
  })

  it('republishes withhold and fails closed when restore finalization sees a changed tuple', async () => {
    const { aggregate, assessment, claimant, moderator, notice } =
      await createCopyrightRestorationHoldFixture()
    const target = aggregate.targets[0]!
    const restriction = await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: assessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      imposedById: moderator.id,
    })
    const withhold = (await getActionIntent(notice.id, 'withhold'))!
    await expect(
      processCopyrightActionIntent(withhold.id, new Date(), {
        ...createTestCopyrightDeliveryDependencies(async () => undefined),
      }),
    ).resolves.toBe('applied')
    const restore = await createRestoreIntent({
      claimant,
      moderator,
      noticeId: notice.id,
      restrictionId: restriction.id,
      target,
    })
    let lookups = 0
    await expect(
      processCopyrightActionIntent(restore.id, restore.now, {
        getImagePlacementForCopyright: async () => {
          lookups += 1
          const placement = {
            ...currentPlacement(target),
            withheld: lookups === 1,
            revision: target.placement_revision + 1,
          }
          return lookups === 1 ? placement : { ...placement, imageId: crypto.randomUUID() }
        },
        restoreImagePlacementForCopyright: async () => ({
          status: 'already_applied',
          placement: {
            ...currentPlacement(target),
            withheld: false,
            revision: target.placement_revision + 1,
          },
        }),
        ...createTestCopyrightDeliveryDependencies(async input => {
          if (input.state === 'withheld') throw new Error('rollback outage')
        }),
      }),
    ).rejects.toThrow('rollback outage')
    const statements = (await readTestCopyrightStatementIntents(notice.id)).filter(
      row => row.delivery_kind === 'poster_restoration_notice' && row.channel === 'email',
    )
    expect(statements).toHaveLength(1)
    expect(statements[0]?.text).toContain('Restoration is authorized.')
    expect(statements[0]?.text).toContain('when restoration delivery completes')
    expect(statements[0]?.text).not.toContain('The image is visible again.')
  })
})

async function getActionIntent(noticeId: string, action: 'withhold' | 'restore') {
  return (await getCopyrightNoticePrivateAggregate(noticeId))?.actionIntents.find(
    intent => intent.action === action,
  )
}

function currentPlacement(target: {
  placement_id: string
  placement_revision: number
  image_id: string
}): CopyrightImagePlacement {
  return {
    placementId: target.placement_id,
    revision: target.placement_revision,
    imageId: target.image_id,
    deleted: false,
    withheld: false,
    safetyBlocked: false,
  }
}

async function createRestoreIntent(input: {
  claimant: { id: string; roles: readonly string[] }
  moderator: { id: string; roles: readonly string[] }
  noticeId: string
  restrictionId: string
  target: { id: string; placement_revision: number }
}) {
  const { createCounterNoticeRestoreIntent } =
    await import('./evidence-and-holds-restoration-hold-fixtures.mts')
  const { now, restore } = await createCounterNoticeRestoreIntent({
    claimant: input.claimant as never,
    noticeId: input.noticeId,
    moderator: input.moderator as never,
    targetId: input.target.id,
    restrictionId: input.restrictionId,
    placementRevision: input.target.placement_revision,
  })
  return { id: restore.id, now }
}
