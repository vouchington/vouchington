import { describe, expect, it } from 'vitest'
import { searchTopicAliases } from './search-topic-aliases.mts'
import { createTestUser, createTestTopic } from '@voucha/test-helpers'
import { createTopicAliases } from './aliases.mts'
import { mergeTopicAliases } from './merge-aliases.mts'
import { getTopicByAny } from './get.mts'

describe('searchTopicAliases - merged topic filter', () => {
  it('excludes aliases belonging to merged topics', async () => {
    const admin = await createTestUser({ administrator: true })
    const r = Math.random().toString(36).slice(2, 10)

    const source = await createTestTopic({ user: admin, name: `Alias Source ${r}` })
    const destination = await createTestTopic({ user: admin, name: `Alias Dest ${r}` })
    const aliasKey = `alias-src-${r}`
    await createTopicAliases(source.id, aliasKey)

    const fullSource = await getTopicByAny(source.id)
    const fullDestination = await getTopicByAny(destination.id)
    if (!fullSource || !fullDestination) throw new Error('Test topics not found')

    await mergeTopicAliases(admin, fullSource, fullDestination)

    // After merge, aliasKey is moved from source to destination. Searching by aliasKey must
    // return it as belonging to destination, not source (which is now merged).
    const { results: byAlias } = await searchTopicAliases({ prefixQuery: aliasKey })
    expect(byAlias.length).toBeGreaterThan(0)
    const found = byAlias.find(row => row.alias === aliasKey)
    expect(found).toBeDefined()
    expect(found?.topic_id).toBe(destination.id)
    expect(found?.topic_id).not.toBe(source.id)
  })

  it('returns aliases for active topics', async () => {
    const user = await createTestUser()
    const r = Math.random().toString(36).slice(2, 10)
    const topic = await createTestTopic({ user, name: `Active Alias Topic ${r}` })
    const aliasKey = `active-alias-${r}`
    await createTopicAliases(topic.id, aliasKey)

    const { results } = await searchTopicAliases({ prefixQuery: aliasKey })

    const found = results.find(row => row.alias === aliasKey)
    expect(found).toBeDefined()
    expect(found?.topic_id).toBe(topic.id)
  })

  it('finds aliases via textQuery full text search', async () => {
    const user = await createTestUser()
    const r = Math.random().toString(36).slice(2, 10)
    const topic = await createTestTopic({ user, name: `Text Query Alias Topic ${r}` })
    const aliasKey = `textqueryalias${r}`
    await createTopicAliases(topic.id, aliasKey)

    const { results } = await searchTopicAliases({ textQuery: aliasKey })

    const found = results.find(row => row.alias === aliasKey)
    expect(found).toBeDefined()
    expect(found?.topic_id).toBe(topic.id)
  })
})
