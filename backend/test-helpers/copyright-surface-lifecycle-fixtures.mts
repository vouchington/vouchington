import { prepublishCopyrightImagePlacementDenial } from '../services/copyright-notices/action-delivery-edge.mts'
import { seedRestorationSceneWithhold } from './copyright-withhold-scene-fixture.mts'
import { seedEffectiveConfirmation } from './copyright-effective-review-decisions.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import type {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from './copyright-surface-target-fixtures.mts'

export type SurfaceLifecycleFixture = Awaited<ReturnType<typeof createTestCopyrightImageFixture>>
export type SurfaceLifecycleCase = Awaited<
  ReturnType<typeof createTestCopyrightRestrictionForImage>
>

/** Full fail-closed withhold precedes independent public projection/cache and restoration subjects. */
export async function seedSurfaceLifecycleWithhold(
  fixture: SurfaceLifecycleFixture,
  record: SurfaceLifecycleCase,
) {
  await prepublishCopyrightImagePlacementDenial({
    placementId: fixture.placementId,
    revision: fixture.placementRevision,
    imageId: fixture.imageId,
  })
  await seedRestorationSceneWithhold(record.withholdIntentId)
}

export async function seedSurfaceLifecycleReversal(record: SurfaceLifecycleCase) {
  await seedEffectiveConfirmation(
    record.noticeId,
    record.restrictionId,
    record.moderator,
    'reverse',
  )
  const aggregate = await getCopyrightNoticePrivateAggregate(record.noticeId)
  const restore = aggregate!.actionIntents.find(row => row.action === 'restore')
  if (!restore) throw new Error('Owned surface restoration obligation disappeared')
  return restore
}
