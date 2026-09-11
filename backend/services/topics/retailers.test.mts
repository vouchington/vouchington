import { it, beforeAll, describe } from 'vitest'
import assert from 'node:assert/strict'
import { createTestUser } from '@voucha/test-helpers'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import { getTestCountryId } from '@voucha/test-helpers/entities/retailers'
import {
  getRetailerAttributes,
  updateRetailerAttributes,
  getRetailerCountries,
  updateRetailerCountries,
} from './retailers.mts'
import type { Topic } from './types.mts'
import type { PrivateUser } from '@services/users/types'

describe('retailers', () => {
  let adminUser: PrivateUser
  let retailerTopicId: string | null = null
  let COUNTRY_ID_US: number
  let COUNTRY_ID_CA: number

  beforeAll(async () => {
    adminUser = await createTestUser({ administrator: true })
    COUNTRY_ID_US = await getTestCountryId('US')
    COUNTRY_ID_CA = await getTestCountryId('CA')

    const randomSuffix = Math.random().toString(36).slice(7)
    retailerTopicId = await insertTestTopic({
      name: `Test Retailer ${randomSuffix}`,
      slug: `test-retailer-${randomSuffix}`,
      createdById: adminUser.id,
      topicType: 'topic',
    })
    // Initialize the retailer extension row so retailer_countries FK can reference it
    const retailerTopic = {
      id: retailerTopicId,
      topic_type: 'topic' as const,
    } as unknown as Topic
    await updateRetailerAttributes(adminUser, retailerTopic)
  })

  it('getRetailerAttributes returns attributes initially', async () => {
    const topic = {
      id: retailerTopicId!,
      topic_type: 'topic' as const,
    } as unknown as Topic

    const attributes = await getRetailerAttributes(topic)
    assert.ok(attributes)
  })

  it('updateRetailerAttributes creates new attributes', async () => {
    const topic = {
      id: retailerTopicId!,
      topic_type: 'topic' as const,
    } as unknown as Topic

    const attributes = await updateRetailerAttributes(adminUser, topic)
    assert.ok(attributes)
  })

  it('getRetailerAttributes returns existing attributes', async () => {
    const topic = {
      id: retailerTopicId!,
      topic_type: 'topic' as const,
    } as unknown as Topic

    const attributes = await getRetailerAttributes(topic)
    assert.ok(attributes)
  })

  it('updateRetailerAttributes rejects unauthenticated users', async () => {
    const topic = {
      id: retailerTopicId!,
      topic_type: 'topic' as const,
    } as unknown as Topic

    try {
      await updateRetailerAttributes(null, topic)
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal((error as { status: number }).status, 401)
    }
  })

  it('updateRetailerAttributes accepts any topic type (retailer is an additive facet)', async () => {
    const randomSuffix = Math.random().toString(36).slice(7)
    const cardTopicId = await insertTestTopic({
      name: `Card Retailer ${randomSuffix}`,
      slug: `card-retailer-${randomSuffix}`,
      createdById: adminUser.id,
      topicType: 'card',
    })
    const cardTopic = {
      id: cardTopicId,
      topic_type: 'card' as const,
    } as unknown as Topic

    const attributes = await updateRetailerAttributes(adminUser, cardTopic)
    assert.ok(attributes)
  })

  it('getRetailerCountries returns empty array initially', async () => {
    const topic = {
      id: retailerTopicId!,
      topic_type: 'topic' as const,
    } as unknown as Topic

    const countries = await getRetailerCountries(topic)
    assert.ok(Array.isArray(countries))
    assert.equal(countries.length, 0)
  })

  it('updateRetailerCountries sets countries', async () => {
    const topic = {
      id: retailerTopicId!,
      topic_type: 'topic' as const,
    } as unknown as Topic

    const countries = await updateRetailerCountries(adminUser, topic, [
      COUNTRY_ID_US,
      COUNTRY_ID_CA,
    ])

    assert.equal(countries.length, 2)
    const ids = countries.map(c => c.id)
    assert.ok(ids.includes(COUNTRY_ID_US))
    assert.ok(ids.includes(COUNTRY_ID_CA))
  })

  it('getRetailerCountries returns set countries', async () => {
    const topic = {
      id: retailerTopicId!,
      topic_type: 'topic' as const,
    } as unknown as Topic

    const countries = await getRetailerCountries(topic)
    assert.equal(countries.length, 2)
  })

  it('updateRetailerCountries replaces existing countries', async () => {
    const topic = {
      id: retailerTopicId!,
      topic_type: 'topic' as const,
    } as unknown as Topic

    const countries = await updateRetailerCountries(adminUser, topic, [COUNTRY_ID_US])

    assert.equal(countries.length, 1)
    assert.equal(countries[0].id, COUNTRY_ID_US)
  })

  it('updateRetailerCountries can set empty array', async () => {
    const topic = {
      id: retailerTopicId!,
      topic_type: 'topic' as const,
    } as unknown as Topic

    const countries = await updateRetailerCountries(adminUser, topic, [])
    assert.equal(countries.length, 0)
  })

  it('updateRetailerCountries rejects unauthenticated users', async () => {
    const topic = {
      id: retailerTopicId!,
      topic_type: 'topic' as const,
    } as unknown as Topic

    try {
      await updateRetailerCountries(null, topic, [COUNTRY_ID_US])
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal((error as { status: number }).status, 401)
    }
  })

  it('updateRetailerAttributes returns existing attributes when no changes', async () => {
    const topic = {
      id: retailerTopicId!,
      topic_type: 'topic' as const,
    } as unknown as Topic

    const attributes = await updateRetailerAttributes(adminUser, topic)
    assert.ok(attributes)
  })
})
