import { createTestCopyrightImageFixture } from './copyright-surface-target-fixtures.mts'
import { createTestLiftNotice } from './copyright-administrator-lift-fixtures.mts'
import { seedRestorationSceneWithhold } from './copyright-withhold-scene-fixture.mts'
import { prepublishCopyrightImagePlacementDenial } from '../services/copyright-notices/action-delivery-edge.mts'
import { getImagePlacementForCopyright } from '../services/images/placements.mts'
import { stageImagePlacementDeliveryRecord } from '../services/media-delivery-safety/index.mts'
import { markTestMediaDeliveryRecordFailed } from './entities/image-surface-placements.mts'

/** Replay subjects start from complete committed imposition/physical-denial facts and a failed registry row. */
export async function createCommittedFailedRegistryReplayFixture() {
  const fixture = await createTestCopyrightImageFixture('post-image', { actorWithEmail: true })
  const notice = await createTestLiftNotice([fixture], { claimantUserId: fixture.actorUserId })
  const withhold = notice.actionIntents.find(row => row.action === 'withhold')
  if (!withhold) throw new Error('Owned registry replay withhold disappeared')
  await prepublishCopyrightImagePlacementDenial({
    placementId: fixture.placementId,
    revision: fixture.placementRevision,
    imageId: fixture.imageId,
  })
  await seedRestorationSceneWithhold(withhold.id)
  const placement = await getImagePlacementForCopyright(fixture.placementId)
  if (!placement?.withheld) throw new Error('Owned replay placement was not withheld')
  const staged = await stageImagePlacementDeliveryRecord({
    placementId: fixture.placementId,
    revision: placement.revision,
    imageId: fixture.imageId,
    state: 'withheld',
  })
  await markTestMediaDeliveryRecordFailed(staged.mediaDeliveryRegistryRecordId)
  return {
    noticeId: notice.noticeId,
    moderator: notice.moderator,
    mediaDeliveryRegistryRecordId: staged.mediaDeliveryRegistryRecordId,
  }
}
