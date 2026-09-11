import { describe, it, expect } from 'vitest'
import {
  getFediverseInstanceAttributes,
  getFediverseInstanceAttributesByIdBatch,
} from './get-attributes.mts'
import {
  createTestUserDirect,
  insertTestTopic,
  insertTestFediverseInstanceExtension,
} from '@voucha/test-helpers'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

async function createInstanceTopic(data: { software?: string; openRegistrations?: boolean }) {
  const user = await createTestUserDirect()
  const suffix = randomSuffix()
  const topicId = await insertTestTopic({
    name: `Get Attrs Topic ${suffix}`,
    slug: `get-attrs-topic-${suffix}`,
    createdById: user.id,
  })
  await insertTestFediverseInstanceExtension({
    topicId,
    software: data.software,
    openRegistrations: data.openRegistrations,
  })
  return topicId
}

describe('getFediverseInstanceAttributes', () => {
  it('returns null when no extension row exists for the topic', async () => {
    const user = await createTestUserDirect()
    const suffix = randomSuffix()
    const topicId = await insertTestTopic({
      name: `No Extension Topic ${suffix}`,
      slug: `no-extension-topic-${suffix}`,
      createdById: user.id,
    })
    expect(await getFediverseInstanceAttributes(topicId)).toBeNull()
  })

  it('returns the extension row for a topic with an extension', async () => {
    const topicId = await createInstanceTopic({ software: 'mastodon', openRegistrations: true })

    const attributes = await getFediverseInstanceAttributes(topicId)

    expect(attributes).toMatchObject({
      software: 'mastodon',
      open_registrations: true,
      integration_status: 'pending',
    })
  })
})

describe('getFediverseInstanceAttributesByIdBatch', () => {
  it('returns empty array for empty input', async () => {
    expect(await getFediverseInstanceAttributesByIdBatch([])).toEqual([])
  })

  it('fetches multiple extension rows by topic ID, preserving input order', async () => {
    const topicIdA = await createInstanceTopic({ software: 'mastodon' })
    const topicIdB = await createInstanceTopic({ software: 'peertube' })

    const results = await getFediverseInstanceAttributesByIdBatch([topicIdB, topicIdA])

    expect(results).toHaveLength(2)
    expect(results[0]?.software).toBe('peertube')
    expect(results[1]?.software).toBe('mastodon')
  })

  it('returns null for topics with no extension row while preserving order', async () => {
    const user = await createTestUserDirect()
    const suffix = randomSuffix()
    const bareTopicId = await insertTestTopic({
      name: `Bare Topic ${suffix}`,
      slug: `bare-topic-${suffix}`,
      createdById: user.id,
    })
    const topicId = await createInstanceTopic({ software: 'lemmy' })

    const results = await getFediverseInstanceAttributesByIdBatch([bareTopicId, topicId])

    expect(results).toHaveLength(2)
    expect(results[0]).toBeNull()
    expect(results[1]?.software).toBe('lemmy')
  })

  it('throws for invalid topic IDs', async () => {
    await expect(getFediverseInstanceAttributesByIdBatch(['not-a-uuid'])).rejects.toThrow(
      'Invalid topic ID',
    )
  })
})
