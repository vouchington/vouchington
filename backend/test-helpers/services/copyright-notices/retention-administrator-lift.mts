import { createTestUserDirect } from '../../entities/users.mts'
import { createTestCopyrightDeliveryDependencies } from '../../copyright-delivery-dependencies.mts'
import { processCopyrightActionIntent } from '../../../services/copyright-notices/action-delivery.mts'
import { liftCopyrightRestrictionWithoutSetter } from '../../../services/copyright-notices/restriction-lifts.mts'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from './surface-target-fixtures.mts'

/** Supplies an encrypted administrator rationale row for the retention guard's table inventory. */
export async function createRetentionAdministratorLiftCase(): Promise<{ noticeId: string }> {
  const fixture = await createTestCopyrightImageFixture('topic-logo-image')
  const restricted = await createTestCopyrightRestrictionForImage(fixture)
  await processCopyrightActionIntent(
    restricted.withholdIntentId,
    new Date(),
    createTestCopyrightDeliveryDependencies(async () => undefined),
  )
  const administrator = await createTestUserDirect({ administrator: true })
  await liftCopyrightRestrictionWithoutSetter({
    currentUser: administrator,
    noticeId: restricted.noticeId,
    restrictionId: restricted.restrictionId,
    rationale: `No member can answer for this topic image ${crypto.randomUUID()}`,
    liftedAt: new Date(),
  })
  return { noticeId: restricted.noticeId }
}
