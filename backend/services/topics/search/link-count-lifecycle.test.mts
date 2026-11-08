import { describe, expect, it } from 'vitest'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import {
  createReferralProgramFixture,
  disableReferralProgramByTopicId,
  enableReferralProgramByTopicId,
} from '@voucha/test-helpers/entities/referral-programs'
import { insertTestUserReferralProgramLink } from '@voucha/test-helpers/entities/referral-links'
import {
  readReferralProgramActiveLinkCount,
  readReferralProgramRankedLinkCount,
} from '@voucha/test-helpers/entities/referral-program-link-counts'
import { createTestUrlWithHostname } from '@voucha/test-helpers/entities/urls'
import { mergeTopicForTest, softDeleteTopic } from '@voucha/test-helpers/entities/topics'
import { restoreTopic } from '@voucha/test-helpers/entities/topics-restore'
import { hardDeleteTestUser } from '@voucha/test-helpers/entities/users-lifecycle'
import { getTopicByAny } from '../get.mts'
import { updateReferralProgramAttributes } from '../referral-programs.mts'

describe('referral program link-count search membership', () => {
  it('preserves counts and enable state across deletion and restoration with an inactive company', async () => {
    const user = await createTestUser({ administrator: true })
    const company = await createTestTopic({ user })
    const program = await createReferralProgramFixture({ createdById: user.id })
    const topic = await getTopicByAny(program.referralProgramId)
    await updateReferralProgramAttributes(user, topic!, { company_topic_id: company.id })
    await insertTestUserReferralProgramLink({
      userId: user.id,
      referralProgramId: program.referralProgramId,
      urlId: await createTestUrlWithHostname(),
    })
    expect(await readReferralProgramRankedLinkCount(program.referralProgramId)).toBe(1)

    await softDeleteTopic(company.id, user.id)
    await softDeleteTopic(program.referralProgramId, user.id)
    expect(await readReferralProgramActiveLinkCount(program.referralProgramId)).toBe(1)
    expect(await readReferralProgramRankedLinkCount(program.referralProgramId)).toBeNull()

    await restoreTopic(program.referralProgramId)
    expect(await readReferralProgramRankedLinkCount(program.referralProgramId)).toBe(1)
  })

  it('removes merged programs and keeps later link-owner cleanup exact', async () => {
    const user = await createTestUser()
    const owner = await createTestUser()
    const destination = await createTestTopic({ user })
    const program = await createReferralProgramFixture({ createdById: user.id })
    await insertTestUserReferralProgramLink({
      userId: owner.id,
      referralProgramId: program.referralProgramId,
      urlId: await createTestUrlWithHostname(),
    })

    await mergeTopicForTest(program.referralProgramId, destination.id, user.id)
    expect(await readReferralProgramActiveLinkCount(program.referralProgramId)).toBe(1)
    expect(await readReferralProgramRankedLinkCount(program.referralProgramId)).toBeNull()
    await hardDeleteTestUser(owner.id)
    expect(await readReferralProgramActiveLinkCount(program.referralProgramId)).toBe(0)
    expect(await readReferralProgramRankedLinkCount(program.referralProgramId)).toBeNull()
  })

  it('projects enable and disable changes without ranking zero-count programs', async () => {
    const user = await createTestUser()
    const program = await createReferralProgramFixture({ createdById: user.id })
    expect(await readReferralProgramRankedLinkCount(program.referralProgramId)).toBeNull()
    await insertTestUserReferralProgramLink({
      userId: user.id,
      referralProgramId: program.referralProgramId,
      urlId: await createTestUrlWithHostname(),
    })
    await disableReferralProgramByTopicId(program.referralProgramId)
    expect(await readReferralProgramActiveLinkCount(program.referralProgramId)).toBe(1)
    expect(await readReferralProgramRankedLinkCount(program.referralProgramId)).toBeNull()
    await enableReferralProgramByTopicId(program.referralProgramId)
    expect(await readReferralProgramRankedLinkCount(program.referralProgramId)).toBe(1)
  })
})
