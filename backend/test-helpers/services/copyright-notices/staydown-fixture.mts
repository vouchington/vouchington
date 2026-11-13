import { createEffectiveStaydownNotice } from '../../copyright-effective-review-fixtures.mts'
import { seedEffectiveConfirmation } from '../../copyright-effective-review-decisions.mts'
import { readCopyrightStaydownEntries } from '../../data-stores/psql/copyright-staydown.mts'
import { enqueueCopyrightStaydownHashes } from '../../../services/copyright-notices/staydown-registration.mts'

/** Committed registration prerequisite; matching subjects invoke their real processor afterward. */
export async function createRestrictedStaydownCase() {
  const fixture = await createEffectiveStaydownNotice()
  await seedEffectiveConfirmation(fixture.noticeId, fixture.restrictions[0]!.id, fixture.moderator)
  const entries = await readCopyrightStaydownEntries(fixture.noticeId)
  enqueueCopyrightStaydownHashes(entries.map(entry => entry.image_id))
  return { ...fixture, imageIds: fixture.restrictions.map(restriction => restriction.imageId) }
}
