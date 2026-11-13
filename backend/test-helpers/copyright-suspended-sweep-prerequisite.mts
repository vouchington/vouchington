import { createTestUser } from './index.mts'
import { createClearScreenedForm } from './services/copyright-notices/screened-form.mts'
import { seedServiceReviewRestriction } from './copyright-service-review-prerequisites.mts'
import { suspendUser } from '../services/users/suspension.mts'

/** A complete current automatic restriction and committed staff suspension precede the actual sweep. */
export async function createCommittedSuspendedSweepCase() {
  const [claimant, moderator, administrator] = await Promise.all([
    createTestUser(),
    createTestUser({ extraRoles: ['moderator'] }),
    createTestUser({ administrator: true }),
  ])
  const { notice, screeningId } = await createClearScreenedForm(1, { claimant })
  await seedServiceReviewRestriction(notice, moderator, screeningId)
  await suspendUser(administrator, claimant.id, 'allow', 'Misused the copyright notice form')
  return notice.intake.copyright_notice_id
}
