import { it, beforeAll, describe } from 'vitest'
import assert from 'node:assert/strict'
import { createTestUser } from '@voucha/test-helpers'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import { getCardAttributes, updateCardAttributes } from './cards.mts'
import type { Topic } from './types.mts'
import type { PrivateUser } from '@services/users/types'
import { mapCardAttributeReferenceError } from './card-attribute-errors.mts'

describe('cards', () => {
  let adminUser: PrivateUser
  let cardTopicId: string | null = null
  let bankTopicId: string | null = null
  let brandTopicId: string | null = null

  beforeAll(async () => {
    adminUser = await createTestUser({ administrator: true })

    // Create test topics
    const randomSuffix = Math.random().toString(36).slice(7)
    cardTopicId = await insertTestTopic({
      name: `Test Card ${randomSuffix}`,
      slug: `test-card-${randomSuffix}`,
      createdById: adminUser!.id,
      topicType: 'card',
    })
    bankTopicId = await insertTestTopic({
      name: `Test Bank ${randomSuffix}`,
      slug: `test-bank-${randomSuffix}`,
      createdById: adminUser!.id,
    })
    brandTopicId = await insertTestTopic({
      name: `Test Brand ${randomSuffix}`,
      slug: `test-brand-${randomSuffix}`,
      createdById: adminUser!.id,
    })
  })
  it('getCardAttributes returns null for non-existent card', async () => {
    const topic = {
      id: cardTopicId!,
      topic_type: 'card' as const,
    } as unknown as Topic

    const attributes = await getCardAttributes(topic)
    assert.equal(attributes, null)
  })

  it('updateCardAttributes creates new card attributes', async () => {
    const topic = {
      id: cardTopicId!,
      topic_type: 'card' as const,
    } as unknown as Topic

    const attributes = await updateCardAttributes(adminUser, topic, {
      bank_id: bankTopicId,
      brand_id: brandTopicId,
      annual_fee: { amount: 9500, currency: 'usd' },
    })

    assert.ok(attributes)
    assert.equal(attributes.bank_id, bankTopicId)
    assert.equal(attributes.brand_id, brandTopicId)
    assert.deepEqual(attributes.annual_fee, { amount: 9500, currency: 'usd' })
  })

  it('getCardAttributes returns existing card attributes', async () => {
    const topic = {
      id: cardTopicId!,
      topic_type: 'card' as const,
    } as unknown as Topic

    const attributes = await getCardAttributes(topic)

    assert.ok(attributes)
    assert.equal(attributes.bank_id, bankTopicId)
    assert.equal(attributes.brand_id, brandTopicId)
    assert.deepEqual(attributes.annual_fee, { amount: 9500, currency: 'usd' })
  })

  it('updateCardAttributes updates existing card attributes', async () => {
    const topic = {
      id: cardTopicId!,
      topic_type: 'card' as const,
    } as unknown as Topic

    const attributes = await updateCardAttributes(adminUser, topic, {
      annual_fee: { amount: 550, currency: 'jpy' },
    })

    assert.ok(attributes)
    assert.equal(attributes.bank_id, bankTopicId)
    assert.equal(attributes.brand_id, brandTopicId)
    assert.deepEqual(attributes.annual_fee, { amount: 550, currency: 'jpy' })
  })

  it('updateCardAttributes can set attributes to null', async () => {
    const topic = {
      id: cardTopicId!,
      topic_type: 'card' as const,
    } as unknown as Topic

    const attributes = await updateCardAttributes(adminUser, topic, {
      bank_id: null,
      annual_fee: null,
    })

    assert.ok(attributes)
    assert.equal(attributes.bank_id, null)
    assert.equal(attributes.brand_id, brandTopicId)
    assert.equal(attributes.annual_fee, null)
  })

  it('updateCardAttributes rejects unauthenticated users', async () => {
    const topic = {
      id: cardTopicId!,
      topic_type: 'card' as const,
    } as unknown as Topic

    try {
      await updateCardAttributes(null, topic, {
        annual_fee: { amount: 10_000, currency: 'usd' },
      })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 401)
    }
  })

  it('updateCardAttributes rejects non-card topics', async () => {
    const nonCardTopic = {
      id: bankTopicId!,
      topic_type: 'topic' as const,
    } as unknown as Topic

    try {
      await updateCardAttributes(adminUser, nonCardTopic, {
        annual_fee: { amount: 10_000, currency: 'usd' },
      })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 400)
    }
  })

  it('updateCardAttributes returns existing attributes when no changes', async () => {
    const topic = {
      id: cardTopicId!,
      topic_type: 'card' as const,
    } as unknown as Topic

    const attributes = await updateCardAttributes(adminUser, topic, {})

    assert.ok(attributes)
    assert.equal(attributes.brand_id, brandTopicId)
  })

  it.each([
    ['topics__cards_topic_id_fkey', 404, 'Not found'],
    ['topics__cards_bank_id_fkey', 422, 'Invalid bank_id'],
    ['topics__cards_brand_id_fkey', 422, 'Invalid brand_id'],
  ])('maps the %s race to a precise domain error', async (constraint, status, message) => {
    await assert.rejects(
      mapCardAttributeReferenceError(() => Promise.reject({ code: '23503', constraint })),
      { status, message },
    )
  })

  it('does not relabel unrelated database errors as card reference errors', async () => {
    const error = { code: '23503', constraint: 'topics__cards_currency_code_fkey' }

    await assert.rejects(
      mapCardAttributeReferenceError(() => Promise.reject(error)),
      candidate => candidate === error,
    )
  })
})
