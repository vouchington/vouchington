import { it, expect, describe } from 'vitest'
import { createTopicAliases, unlinkTopicAlias, updateTopicAliasesField } from '../aliases.mts'
import { searchTopicAliases } from '../search-topic-aliases.mts'
import { getTopicAliases } from '../get-topic-aliases.mts'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import { getTopicByAny } from '../get.mts'
import { getTopicIdByAnyCached } from '@services/entity-cache/lookups'

describe('searchTopicAliases', () => {
  it('searches aliases by prefix', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      createdById: user!.id,
    })
    const prefix = `prefix-${random}`
    await createTopicAliases(topicId, [`${prefix}-one`, `${prefix}-two`, `other-alias-${random}`])

    const { results } = await searchTopicAliases({ prefixQuery: prefix })

    expect(results.length).toBeGreaterThanOrEqual(2)
    expect(results.some(r => r.alias === `${prefix}-one`)).toBe(true)
    expect(results.some(r => r.alias === `${prefix}-two`)).toBe(true)
  })

  it('filters by topic_id', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topic1Id = await insertTestTopic({
      name: `Test Topic 1 ${random}`,
      slug: `test-topic-1-${random}`,
      createdById: user!.id,
    })
    const topic2Id = await insertTestTopic({
      name: `Test Topic 2 ${random}`,
      slug: `test-topic-2-${random}`,
      createdById: user!.id,
    })
    await createTopicAliases(topic1Id, `topic1-alias-${random}`)
    await createTopicAliases(topic2Id, `topic2-alias-${random}`)

    const { results } = await searchTopicAliases({ topicId: topic1Id })

    expect(results.every(r => r.topic_id === topic1Id)).toBe(true)
    expect(results.some(r => r.alias === `topic1-alias-${random}`)).toBe(true)
    expect(results.some(r => r.alias === `topic2-alias-${random}`)).toBe(false)
  })

  it('respects limit parameter', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      createdById: user!.id,
    })
    await createTopicAliases(topicId, [
      `alias1-${random}`,
      `alias2-${random}`,
      `alias3-${random}`,
      `alias4-${random}`,
      `alias5-${random}`,
    ])

    const { results } = await searchTopicAliases({ topicId: topicId, limit: 2 })

    expect(results.length).toBe(2)
  })

  it('returns topic data with aliases', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      createdById: user!.id,
    })
    await createTopicAliases(topicId, `test-alias-${random}`)

    const { results } = await searchTopicAliases({ topicId: topicId })

    expect(results[0]!.topic).toBeDefined()
    expect(results[0]!.topic.id).toBe(topicId)
    expect(results[0]!.topic.name).toBe(`Test Topic ${random}`)
  })
})

describe('unlinkTopicAlias', () => {
  it('rejects unlinking an active topic slug', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const slug = `active-slug-${random}`
    const topicId = await insertTestTopic({
      name: `Active Slug Topic ${random}`,
      slug,
      createdById: user!.id,
    })
    const [alias] = await createTopicAliases(topicId, slug)

    await expect(unlinkTopicAlias(alias!.id, { expectedTopicId: topicId })).rejects.toMatchObject({
      status: 409,
    })
    await expect(getTopicAliases(topicId)).resolves.toMatchObject({
      results: expect.arrayContaining([slug]),
    })
  })

  it('deletes single alias', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      createdById: user!.id,
    })
    const created = await createTopicAliases(topicId, [`alias1-${random}`, `alias2-${random}`])
    await unlinkTopicAlias(created.find(alias => alias.alias === `alias1-${random}`)!.id, {
      expectedTopicId: topicId,
    })

    const { results: aliases } = await getTopicAliases(topicId)

    expect(aliases).not.toContain(`alias1-${random}`)
    expect(aliases).toContain(`alias2-${random}`)
  })

  it('invalidates topic lookup cache when alias is deleted', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Delete Alias Cache Topic ${random}`,
      slug: `delete-alias-cache-topic-${random}`,
      createdById: user!.id,
    })
    const alias = `delete-cache-alias-${random}`
    const [created] = await createTopicAliases(topicId, alias)
    expect(await getTopicIdByAnyCached(alias)).toBe(topicId)

    await unlinkTopicAlias(created!.id, { expectedTopicId: topicId })
    expect(await getTopicIdByAnyCached(alias)).toBeNull()
  })
})

describe('updateTopicAliasesField', () => {
  it('updates topic.aliases field with all aliases', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      createdById: user!.id,
    })
    await createTopicAliases(topicId, [`alias1-${random}`, `alias2-${random}`, `alias3-${random}`])
    await updateTopicAliasesField(topicId)

    const topic = await getTopicByAny(topicId)

    expect(topic!.aliases).toContain(`alias1-${random}`)
    expect(topic!.aliases).toContain(`alias2-${random}`)
    expect(topic!.aliases).toContain(`alias3-${random}`)
  })

  it('clears topic.aliases when no aliases exist', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      createdById: user!.id,
    })
    const aliases = [`alias1-${random}`, `alias2-${random}`]
    const created = await createTopicAliases(topicId, aliases)
    // Delete all aliases individually
    for (const alias of created) {
      await unlinkTopicAlias(alias.id, { expectedTopicId: topicId })
    }
    await updateTopicAliasesField(topicId)

    const topic = await getTopicByAny(topicId)
    expect(topic!.aliases).toHaveLength(0)
  })
})
