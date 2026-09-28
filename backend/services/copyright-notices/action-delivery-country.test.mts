import { getImagePlacementDeliveryKey } from '@services/media-delivery-safety'
import type { CopyrightImagePlacement } from '@services/images/placements'
import { beginTransaction } from '@voucha/test-helpers'
import { getTestMediaDeliveryRecord } from '@voucha/test-helpers/entities/image-surface-placements'
import { createTestCopyrightDeliveryDependencies } from '@voucha/test-helpers/copyright-delivery-dependencies'
import {
  readTestCopyrightRestrictionCountryCodes,
  readTestDeniedCountryCodes,
} from '@voucha/test-helpers/copyright-country-grounds'
import { describe, expect, it } from 'vitest'
import { finishCountryScopedCopyrightAction } from './action-delivery-country.mts'
import {
  claimCopyrightActionIntent,
  lockCopyrightActionDelivery,
} from './action-delivery-state.mts'
import {
  createCopyrightRestorationHoldFixture,
  createCounterNoticeRestoreIntent,
} from './evidence-and-holds-restoration-hold-fixtures.mts'
import { copyrightGroundApplicability } from './ground-applicability.mts'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  getCopyrightNoticePrivateAggregate,
  processCopyrightActionIntent,
} from './index.mts'

describe('country-scoped copyright action delivery', () => {
  it('records no country rows when a ground is global', async () => {
    const scene = await openGround({ scope: 'global' })
    await expect(readTestCopyrightRestrictionCountryCodes(scene.restriction.id)).resolves.toEqual(
      [],
    )
  })

  it('blocks a country restore before its recorded earliest restoration time', async () => {
    const scene = await openGround({ scope: 'countries', countryCodes: ['DE'] })
    const opened = await createCounterNoticeRestoreIntent({
      claimant: scene.claimant,
      noticeId: scene.notice.id,
      moderator: scene.moderator,
      targetId: scene.target.id,
      restrictionId: scene.restriction.id,
      placementRevision: scene.target.placement_revision,
    })
    const claimed = await claimCopyrightActionIntent(opened.restore.id, opened.now)
    if (!claimed) throw new Error('country restore was not claimed')
    await using transaction = await beginTransaction()
    const legal = await lockCopyrightActionDelivery(opened.restore.id, transaction)
    if (!legal) throw new Error('claimed country restore disappeared')
    await expect(
      finishCountryScopedCopyrightAction({
        intentId: opened.restore.id,
        legal,
        placement: placement(scene.target, false),
        now: new Date(opened.deadline.earliest_restoration_at.getTime() - 1),
        query: transaction,
      }),
    ).resolves.toBe('blocked')
    await transaction.commit()

    const finished = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(finished?.actionIntents).toContainEqual(
      expect.objectContaining({
        id: opened.restore.id,
        state: 'blocked',
        completed_at_reason: 'blocked',
      }),
    )
    expect(
      finished?.restrictions.find(row => row.id === scene.restriction.id)?.lifted_at,
    ).toBeNull()
    await expect(getTestMediaDeliveryRecord(deliveryKey(scene.target))).resolves.toBeNull()
  })

  it('lifts a country restore and keeps a globally withheld placement', async () => {
    const scene = await openGround({ scope: 'countries', countryCodes: ['DE'] })
    const opened = await createCounterNoticeRestoreIntent({
      claimant: scene.claimant,
      noticeId: scene.notice.id,
      moderator: scene.moderator,
      targetId: scene.target.id,
      restrictionId: scene.restriction.id,
      placementRevision: scene.target.placement_revision,
    })
    const delivery = deliveryRecorder()
    await expect(
      processCopyrightActionIntent(opened.restore.id, opened.now, {
        ...delivery.dependencies,
        getImagePlacementForCopyright: async () => placement(scene.target, true),
      }),
    ).resolves.toBe('applied')

    const finished = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(
      finished?.restrictions.find(row => row.id === scene.restriction.id)?.lifted_at,
    ).not.toBeNull()
    expect(finished?.actionIntents).toContainEqual(
      expect.objectContaining({
        id: opened.restore.id,
        state: 'completed',
        completed_at_reason: 'completed',
      }),
    )
    expect(finished?.lifecycleEvents).toContainEqual(
      expect.objectContaining({
        event_type: 'restriction_lifted_placement_retained',
        copyright_notice_action_intent_id: opened.restore.id,
      }),
    )
    expect(
      finished?.deadlines.find(row => row.id === opened.deadline.id)?.resolved_at,
    ).not.toBeNull()
    expect(delivery.states).toEqual([])
    await expect(getTestMediaDeliveryRecord(deliveryKey(scene.target))).resolves.toBeNull()
  })

  it('stages an allow for a country withhold and again after restoration is authorized', async () => {
    const scene = await openGround({ scope: 'countries', countryCodes: ['de', 'FR'] })
    await expect(readTestCopyrightRestrictionCountryCodes(scene.restriction.id)).resolves.toEqual([
      'DE',
      'FR',
    ])
    const withhold = await requireIntent(scene.notice.id, 'withhold')
    const delivery = deliveryRecorder()
    const key = deliveryKey(scene.target)
    await expect(
      processCopyrightActionIntent(
        withhold.id,
        new Date('2026-07-01T12:01:00.000Z'),
        delivery.dependencies,
      ),
    ).resolves.toBe('applied')
    await expect(readTestDeniedCountryCodes(key)).resolves.toEqual(['DE', 'FR'])

    const opened = await createCounterNoticeRestoreIntent({
      claimant: scene.claimant,
      noticeId: scene.notice.id,
      moderator: scene.moderator,
      targetId: scene.target.id,
      restrictionId: scene.restriction.id,
      placementRevision: scene.target.placement_revision,
    })
    await expect(
      processCopyrightActionIntent(opened.restore.id, opened.now, delivery.dependencies),
    ).resolves.toBe('applied')

    const finished = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(finished?.lifecycleEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: 'restoration_authorized_pending_delivery',
          copyright_notice_action_intent_id: opened.restore.id,
        }),
        expect.objectContaining({
          event_type: 'placement_restored',
          copyright_notice_action_intent_id: opened.restore.id,
        }),
      ]),
    )
    expect(finished?.restrictions.find(row => row.id === scene.restriction.id)?.lifted_at).toEqual(
      opened.now,
    )
    expect(delivery.states).toEqual(['allow', 'allow'])
    await expect(readTestDeniedCountryCodes(key)).resolves.toEqual([])
  })
})

async function openGround(applicability: Parameters<typeof copyrightGroundApplicability>[0]) {
  const scene = await createCopyrightRestorationHoldFixture()
  const target = scene.aggregate.targets[0]
  if (!target) throw new Error('fixture target disappeared')
  const restriction = await acceptCopyrightNoticeAndImposeRestriction({
    noticeId: scene.notice.id,
    targetId: target.id,
    assessmentId: scene.assessment.id,
    imposedAt: new Date('2026-07-01T12:00:00.000Z'),
    imposedById: scene.moderator.id,
    applicability: copyrightGroundApplicability(applicability),
  })
  return { ...scene, target, restriction }
}

function placement(
  target: { placement_id: string; placement_revision: number; image_id: string },
  withheld: boolean,
): CopyrightImagePlacement {
  return {
    placementId: target.placement_id,
    revision: target.placement_revision,
    imageId: target.image_id,
    deleted: false,
    withheld,
    safetyBlocked: false,
  }
}

function deliveryKey(target: {
  placement_id: string
  placement_revision: number
  image_id: string
}): string {
  return getImagePlacementDeliveryKey({
    placementId: target.placement_id,
    revision: target.placement_revision,
    imageId: target.image_id,
  })
}

function deliveryRecorder() {
  const states: Array<'allow' | 'withheld'> = []
  return {
    states,
    dependencies: createTestCopyrightDeliveryDependencies(async input => {
      states.push(input.state)
    }),
  }
}

async function requireIntent(noticeId: string, action: 'withhold' | 'restore') {
  const intent = (await getCopyrightNoticePrivateAggregate(noticeId))?.actionIntents.find(
    record => record.action === action,
  )
  if (!intent) throw new Error(`${action} intent disappeared`)
  return intent
}
