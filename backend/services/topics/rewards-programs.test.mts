import { it, beforeAll, describe } from 'vitest'
import assert from 'node:assert/strict'
import { createTestUser } from '@voucha/test-helpers'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import { getRewardsProgramAttributes, updateRewardsProgramAttributes } from './rewards-programs.mts'
import type { Topic } from './types.mts'
import type { PrivateUser } from '@services/users/types'

describe('rewards-programs', () => {
  let user: PrivateUser
  let rewardsProgramId: string | null = null
  let companyTopicId: string | null = null

  beforeAll(async () => {
    user = await createTestUser({ administrator: true })

    const randomSuffix = Math.random().toString(36).slice(7)
    rewardsProgramId = await insertTestTopic({
      name: `Test Rewards Program ${randomSuffix}`,
      slug: `test-rewards-program-${randomSuffix}`,
      createdById: user.id,
      topicType: 'rewards_program',
    })
    companyTopicId = await insertTestTopic({
      name: `Test Company ${randomSuffix}`,
      slug: `test-company-${randomSuffix}`,
      createdById: user.id,
    })
  })
  it('getRewardsProgramAttributes returns null for non-existent program', async () => {
    const topic = {
      id: rewardsProgramId!,
      topic_type: 'rewards_program' as const,
    } as unknown as Topic

    const attributes = await getRewardsProgramAttributes(topic)
    assert.equal(attributes, null)
  })

  it('updateRewardsProgramAttributes creates new attributes', async () => {
    const topic = {
      id: rewardsProgramId!,
      topic_type: 'rewards_program' as const,
    } as unknown as Topic

    const attributes = await updateRewardsProgramAttributes(user, topic, {
      company_id: companyTopicId,
    })

    assert.ok(attributes)
    assert.equal(attributes.company_id, companyTopicId)
  })

  it('getRewardsProgramAttributes returns existing attributes', async () => {
    const topic = {
      id: rewardsProgramId!,
      topic_type: 'rewards_program' as const,
    } as unknown as Topic

    const attributes = await getRewardsProgramAttributes(topic)

    assert.ok(attributes)
    assert.equal(attributes.company_id, companyTopicId)
  })

  it('updateRewardsProgramAttributes updates existing attributes', async () => {
    const topic = {
      id: rewardsProgramId!,
      topic_type: 'rewards_program' as const,
    } as unknown as Topic

    const attributes = await updateRewardsProgramAttributes(user, topic, {
      company_id: null,
    })

    assert.ok(attributes)
    assert.equal(attributes.company_id, null)
  })

  it('updateRewardsProgramAttributes rejects unauthenticated users', async () => {
    const topic = {
      id: rewardsProgramId!,
      topic_type: 'rewards_program' as const,
    } as unknown as Topic

    try {
      await updateRewardsProgramAttributes(null, topic, { company_id: companyTopicId })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 401)
    }
  })

  it('updateRewardsProgramAttributes rejects non-rewards-program topics', async () => {
    const nonRewardsTopic = {
      id: companyTopicId!,
      topic_type: 'topic' as const,
    } as unknown as Topic

    try {
      await updateRewardsProgramAttributes(user, nonRewardsTopic, { company_id: companyTopicId })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 400)
    }
  })
})
