import { describe, expect, it } from 'vitest'
import {
  assertTopicExists,
  assertRewardsProgramExists,
  assertReferralProgramExists,
} from './validation.mts'
import { createTestUser, createTestTopic, insertTestRewardsProgram } from '@voucha/test-helpers'
import { createReferralProgramFixture } from '@voucha/test-helpers/entities/referral-programs'
import { mergeTopicAliases } from './merge-aliases.mts'
import { getTopicByAny } from './get.mts'

describe('validation - merged topic filter', () => {
  async function mergeSourceIntoDestination(
    admin: Awaited<ReturnType<typeof createTestUser>>,
    sourceId: string,
  ) {
    if (!admin) throw new Error('Admin is null')
    const destinationTopic = await createTestTopic({
      user: admin,
      name: `Validation Dest ${Math.random()}`,
    })
    const fullSource = await getTopicByAny(sourceId)
    const fullDestination = await getTopicByAny(destinationTopic.id)
    if (!fullSource || !fullDestination) throw new Error('Test topics not found')
    await mergeTopicAliases(admin, fullSource, fullDestination)
  }

  it('assertTopicExists rejects a merged topic', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createTestTopic({
      user: admin,
      name: `Validation Source ${Math.random()}`,
    })

    await mergeSourceIntoDestination(admin, source.id)

    await expect(assertTopicExists(source.id, 'topic_id')).rejects.toMatchObject({ status: 422 })
  })

  it('assertTopicExists accepts an active topic', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user, name: `Active Validation Topic ${Math.random()}` })

    await expect(assertTopicExists(topic.id, 'topic_id')).resolves.toBeUndefined()
  })

  it('assertRewardsProgramExists rejects a merged topic', async () => {
    const admin = await createTestUser({ administrator: true })
    const sourceId = await insertTestRewardsProgram({ createdById: admin.id })

    await expect(
      assertRewardsProgramExists(sourceId, 'rewards_program_id'),
    ).resolves.toBeUndefined()

    await mergeSourceIntoDestination(admin, sourceId)

    await expect(assertRewardsProgramExists(sourceId, 'rewards_program_id')).rejects.toMatchObject({
      status: 422,
    })
  })

  it('assertReferralProgramExists rejects a merged topic', async () => {
    const admin = await createTestUser({ administrator: true })
    const { referralProgramId } = await createReferralProgramFixture({ createdById: admin.id })

    await expect(
      assertReferralProgramExists(referralProgramId, 'referral_program_id'),
    ).resolves.toBeUndefined()

    await mergeSourceIntoDestination(admin, referralProgramId)

    await expect(
      assertReferralProgramExists(referralProgramId, 'referral_program_id'),
    ).rejects.toMatchObject({ status: 422 })
  })
})
