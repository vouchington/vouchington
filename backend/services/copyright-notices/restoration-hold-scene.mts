import type { publishImagePlacementDeliveryRecord } from '@services/media-delivery-safety'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  getCopyrightNoticePrivateAggregate,
} from './index.mts'
import {
  createCopyrightRestorationHoldFixture,
  createCounterNoticeRestoreIntent,
  deliverInitialCopyrightWithhold,
} from './evidence-and-holds-restoration-hold-fixtures.mts'

export async function openHeldCounterNoticeRestore(
  publish: typeof publishImagePlacementDeliveryRecord,
) {
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
  const initialWithhold = (await getCopyrightNoticePrivateAggregate(notice.id))?.actionIntents.find(
    intent => intent.action === 'withhold',
  )
  if (!initialWithhold) throw new Error('initial withhold intent disappeared')
  await deliverInitialCopyrightWithhold(notice.id, publish)
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
