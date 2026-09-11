import { it, beforeAll, describe } from 'vitest'
import assert from 'node:assert/strict'
import { createTestUser } from '@voucha/test-helpers'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import {
  getSpendingCategoryAttributes,
  updateSpendingCategoryAttributes,
  replaceSpendingCategoryAttributes,
} from './spending-categories.mts'
import type { Topic } from './types.mts'

describe('spending-categories', () => {
  let user: Awaited<ReturnType<typeof createTestUser>> | null = null
  let topicId: string | null = null

  beforeAll(async () => {
    user = await createTestUser({ administrator: true })
    const randomSuffix = Math.random().toString(36).slice(7)
    topicId = await insertTestTopic({
      name: `Test Topic ${randomSuffix}`,
      slug: `test-topic-${randomSuffix}`,
      createdById: user!.id,
    })
  })
  it('getSpendingCategoryAttributes returns null for non-existent category', async () => {
    const topic = {
      id: topicId!,
      topic_type: 'topic' as const,
    } as unknown as Topic

    const attributes = await getSpendingCategoryAttributes(topic)
    assert.equal(attributes, null)
  })

  it('updateSpendingCategoryAttributes creates new attributes', async () => {
    const topic = {
      id: topicId!,
      topic_type: 'topic' as const,
    } as unknown as Topic

    const attributes = await updateSpendingCategoryAttributes(user, topic, {
      is_foreign_transaction: true,
      default_spending_frequency: 'annually',
    })

    assert.ok(attributes)
    assert.equal(attributes.is_foreign_transaction, true)
    assert.equal(attributes.default_spending_frequency, 'annually')
  })

  it('getSpendingCategoryAttributes returns existing attributes', async () => {
    const topic = {
      id: topicId!,
      topic_type: 'topic' as const,
    } as unknown as Topic

    const attributes = await getSpendingCategoryAttributes(topic)

    assert.ok(attributes)
    assert.equal(attributes.is_foreign_transaction, true)
    assert.equal(attributes.default_spending_frequency, 'annually')
  })

  it('updateSpendingCategoryAttributes updates existing attributes', async () => {
    const topic = {
      id: topicId!,
      topic_type: 'topic' as const,
    } as unknown as Topic

    const attributes = await updateSpendingCategoryAttributes(user, topic, {
      is_foreign_transaction: false,
    })

    assert.ok(attributes)
    assert.equal(attributes.is_foreign_transaction, false)
    assert.equal(attributes.default_spending_frequency, 'annually')
  })

  it('updateSpendingCategoryAttributes rejects unauthenticated users', async () => {
    const topic = {
      id: topicId!,
      topic_type: 'topic' as const,
    } as unknown as Topic

    try {
      await updateSpendingCategoryAttributes(null, topic, { is_foreign_transaction: true })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 401)
    }
  })

  it('replaceSpendingCategoryAttributes resets omitted fields to defaults', async () => {
    const topic = {
      id: topicId!,
      topic_type: 'topic' as const,
    } as unknown as Topic

    const attributes = await replaceSpendingCategoryAttributes(user, topic, {
      is_foreign_transaction: false,
    })

    assert.ok(attributes)
    assert.equal(attributes.is_foreign_transaction, false)
    assert.equal(attributes.default_spending_frequency, 'monthly')
  })
})
