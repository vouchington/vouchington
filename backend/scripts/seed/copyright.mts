import { COPYRIGHT_SEED_IDENTITY, type CopyrightSeedContext } from './copyright-context.mts'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getSystemUserByUsername } from '@services/users/system-users'
import { seedCopyrightCases } from './copyright-cases.mts'
import { seedCopyrightDeadline } from './copyright-deadline.mts'
import { seedCopyrightEmails } from './copyright-emails.mts'
import { seedCopyrightMedia } from './copyright-media.mts'

/**
 * Local copyright review data so `/copyright/email-review` and `/copyright/review-queue` are not
 * empty: five email intakes (new notice, thread reply, failed parse, no parse row, malware-flagged
 * original) and two guest form cases, one waiting on intake review with AI guidance and one with
 * an overdue deadline.
 * Every write is keyed on a stable id, so `db:seed` can run again without adding rows.
 */
export async function seedCopyright({
  identity = COPYRIGHT_SEED_IDENTITY,
  now,
}: Partial<CopyrightSeedContext> = {}) {
  const seedNow =
    now ??
    (
      await write<{ now: Date }>(sql`/* seedCopyright:clock */
    SELECT CURRENT_TIMESTAMP AS now
  `)
    ).rows[0]!.now
  if (!Number.isFinite(seedNow.getTime())) throw new TypeError('Copyright seed clock must be valid')
  if (!/^[a-z0-9][a-z0-9-]{0,100}$/.test(identity.namespace))
    throw new TypeError('Copyright seed namespace must be a bounded identifier')
  const context: CopyrightSeedContext = { identity: { ...identity }, now: new Date(seedNow) }
  const systemUser = await getSystemUserByUsername('system')
  if (!systemUser) {
    throw new Error('No system user found — seed users first')
  }
  const media = await seedCopyrightMedia(systemUser.id, context)
  const emailIntakeIds = await seedCopyrightEmails(media.hostedUseUrl, context)
  const { intakeReviewCase, deadlineCase } = await seedCopyrightCases(media, context)
  await seedCopyrightDeadline({
    noticeId: deadlineCase.noticeId,
    intakeId: deadlineCase.intakeId,
    reviewerId: systemUser.id,
    context,
  })
  return { emailIntakeIds, intakeReviewCase, deadlineCase }
}
