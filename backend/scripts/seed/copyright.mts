import { getSystemUserByUsername } from '@services/users/system-users'
import { seedCopyrightCases } from './copyright-cases.mts'
import { seedCopyrightDeadline } from './copyright-deadline.mts'
import { seedCopyrightEmails } from './copyright-emails.mts'
import { seedCopyrightMedia } from './copyright-media.mts'

/**
 * Local copyright review data so `/copyright/email-review` and `/copyright/review-queue` are not
 * empty: four email intakes (new notice, thread reply, failed parse, no parse row) and two guest
 * form cases, one waiting on intake review with AI guidance and one with an overdue deadline.
 * Every write is keyed on a stable id, so `db:seed` can run again without adding rows.
 */
export async function seedCopyright() {
  const systemUser = await getSystemUserByUsername('system')
  if (!systemUser) {
    throw new Error('No system user found — seed users first')
  }
  const media = await seedCopyrightMedia(systemUser.id)
  const emailIntakeIds = await seedCopyrightEmails(media.hostedUseUrl)
  const { intakeReviewCase, deadlineCase } = await seedCopyrightCases(media)
  await seedCopyrightDeadline({
    noticeId: deadlineCase.noticeId,
    intakeId: deadlineCase.intakeId,
    reviewerId: systemUser.id,
  })
  return { emailIntakeIds, intakeReviewCase, deadlineCase }
}
