import { it, beforeAll, describe } from 'vitest'
import assert from 'node:assert/strict'
import { createTestUser } from '@voucha/test-helpers'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import {
  getRewardsProgramStatusAttributes,
  updateRewardsProgramStatusAttributes,
} from './rewards-program-statuses.mts'
import { updateRewardsProgramAttributes } from './rewards-programs.mts'
import type { Topic } from './types.mts'
import type { PrivateUser } from '@services/users/types'

describe('rewards-program-statuses', () => {
  let user: PrivateUser
  let statusId: string | null = null
  let rewardsProgramId: string | null = null

  beforeAll(async () => {
    user = await createTestUser({ administrator: true })

    const randomSuffix = Math.random().toString(36).slice(7)

    // Create a rewards program first
    rewardsProgramId = await insertTestTopic({
      name: `Test Rewards Program ${randomSuffix}`,
      slug: `test-rewards-program-${randomSuffix}`,
      createdById: user.id,
      topicType: 'rewards_program',
    })
    // Insert a row into topics__rewards_programs so we can reference it
    const rewardsProgramTopic = {
      id: rewardsProgramId,
      topic_type: 'rewards_program' as const,
    } as unknown as Topic
    await updateRewardsProgramAttributes(user, rewardsProgramTopic, { company_id: null })

    statusId = await insertTestTopic({
      name: `Test Status ${randomSuffix}`,
      slug: `test-status-${randomSuffix}`,
      createdById: user.id,
      topicType: 'rewards_program_status',
    })
  })
  it('getRewardsProgramStatusAttributes returns null for non-existent status', async () => {
    const topic = {
      id: statusId!,
      topic_type: 'rewards_program_status' as const,
      rewards_program_id: null,
    } as unknown as Topic

    const attributes = await getRewardsProgramStatusAttributes(topic)
    assert.equal(attributes, null)
  })

  it('updateRewardsProgramStatusAttributes creates new attributes', async () => {
    const topic = {
      id: statusId!,
      topic_type: 'rewards_program_status' as const,
      rewards_program_id: null,
    } as unknown as Topic

    const attributes = await updateRewardsProgramStatusAttributes(user, topic, {
      order_index: 5,
    })

    assert.ok(attributes)
    assert.equal(attributes.order_index, 5)
  })

  it('getRewardsProgramStatusAttributes returns existing attributes', async () => {
    const topic = {
      id: statusId!,
      topic_type: 'rewards_program_status' as const,
      rewards_program_id: null,
    } as unknown as Topic

    const attributes = await getRewardsProgramStatusAttributes(topic)

    assert.ok(attributes)
    assert.equal(attributes.order_index, 5)
  })

  it('updateRewardsProgramStatusAttributes updates existing attributes', async () => {
    const topic = {
      id: statusId!,
      topic_type: 'rewards_program_status' as const,
      rewards_program_id: null,
    } as unknown as Topic

    const attributes = await updateRewardsProgramStatusAttributes(user, topic, {
      order_index: 10,
    })

    assert.ok(attributes)
    assert.equal(attributes.order_index, 10)
  })

  it('updateRewardsProgramStatusAttributes rejects unauthenticated users', async () => {
    const topic = {
      id: statusId!,
      topic_type: 'rewards_program_status' as const,
      rewards_program_id: null,
    } as unknown as Topic

    try {
      await updateRewardsProgramStatusAttributes(null, topic, { order_index: 1 })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 401)
    }
  })

  it('updateRewardsProgramStatusAttributes rejects non-status topics', async () => {
    const nonStatusTopic = {
      id: rewardsProgramId!,
      topic_type: 'rewards_program' as const,
      rewards_program_id: null,
    } as unknown as Topic

    try {
      await updateRewardsProgramStatusAttributes(user, nonStatusTopic, { order_index: 1 })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 400)
    }
  })
})
