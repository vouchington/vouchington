import { createCopyrightRestorationHoldFixture } from '../../../services/copyright-notices/evidence-and-holds-restoration-hold-fixtures.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from '../../../services/copyright-notices/index.mts'

/**
 * A case whose targets are restricted the way a moderator does it, so staydown registers each
 * target's image when `staydownMatching` is on. `imposedById: null` makes the restriction an
 * unreviewed automated one, which must never register.
 */
export async function createRestrictedStaydownCase(
  options: { targetCount?: number; imposedBy?: 'moderator' | 'automation' } = {},
) {
  const fixture = await createCopyrightRestorationHoldFixture(options.targetCount ?? 1)
  const imposedById = options.imposedBy === 'automation' ? null : fixture.moderator.id
  const restrictions = []
  for (const target of fixture.aggregate.targets) {
    const restriction = await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: fixture.notice.id,
      targetId: target.id,
      assessmentId: fixture.assessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      imposedById,
    })
    restrictions.push(restriction)
  }
  return {
    ...fixture,
    noticeId: fixture.notice.id,
    targets: fixture.aggregate.targets,
    imageIds: fixture.aggregate.targets.map(target => target.image_id),
    restrictions,
  }
}
