import { describe, expect, it } from 'vitest'
import { searchTopicAliases } from './search-topic-aliases.mts'
import { createTestUser, createTestTopic } from '@voucha/test-helpers'
import { createTopicAliases } from './aliases.mts'
import { mergeTopicsForTest as mergeTopicAliases } from '@voucha/test-helpers/merge-topics'
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

  it.each(['%', '_', '\\'])('treats %s as a literal prefix character', async symbol => {
    const topic = await createTestTopic()
    const key = `literal-${crypto.randomUUID()}`
    const literal = `${key}${symbol}match`
    await createTopicAliases(topic.id, [literal, `${key}xmatch`])
    const { results } = await searchTopicAliases({
      topicId: topic.id,
      prefixQuery: `${key}${symbol}`,
    })
    expect(results.map(result => result.alias)).toEqual([literal])

    const { results: withoutTopicId } = await searchTopicAliases({
      prefixQuery: `${key}${symbol}`,
    })
    expect(withoutTopicId.map(result => result.alias)).toEqual([literal])
  })

  it('matches mixed-case prefix queries in ascending alias order with cursor pagination', async () => {
    const topic = await createTestTopic()
    const key = `mixcase-${crypto.randomUUID()}`
    const expected = [`${key}-a`, `${key}-b`, `${key}-c`]
    await createTopicAliases(topic.id, [...expected, `other-${key}`])

    const mixedPrefix = `  MiXcAsE-${key.slice('mixcase-'.length).toUpperCase()}-  `
    const all = await searchTopicAliases({ prefixQuery: mixedPrefix, limit: 10 })
    expect(all.results.map(result => result.alias)).toEqual(expected)
    expect(all.hasNextPage).toBe(false)

    const page1 = await searchTopicAliases({ prefixQuery: mixedPrefix, limit: 2 })
    expect(page1.results.map(result => result.alias)).toEqual(expected.slice(0, 2))
    expect(page1.hasNextPage).toBe(true)
    expect(page1.endAlias).toBe(expected[1])

    const page2 = await searchTopicAliases({
      prefixQuery: mixedPrefix,
      limit: 2,
      after: page1.endAlias!,
    })
    expect(page2.results.map(result => result.alias)).toEqual(expected.slice(2))
    expect(page2.hasNextPage).toBe(false)
  })

  it('combines mixed case with literal % wildcard characters', async () => {
    const topic = await createTestTopic()
    const id = crypto.randomUUID()
    const literal = `mixpct-${id}-a%b-match`
    const wildcardDecoy = `mixpct-${id}-axb-match`
    await createTopicAliases(topic.id, [literal, wildcardDecoy])

    const { results } = await searchTopicAliases({
      prefixQuery: `  MiXpCt-${id.toUpperCase()}-A%B  `,
    })
    expect(results.map(result => result.alias)).toEqual([literal])
  })

  it('folds uppercase non-ASCII prefixes in PostgreSQL LOWER()', async () => {
    const topic = await createTestTopic()
    const id = crypto.randomUUID()
    const accented = `éclair-${id}`
    const dottedI = `istanbul-${id}`
    await createTopicAliases(topic.id, [accented, dottedI, `eclair-${id}`])

    const { results: accentedResults } = await searchTopicAliases({
      prefixQuery: `ÉCLAIR-${id.toUpperCase()}`,
    })
    expect(accentedResults.map(result => result.alias)).toEqual([accented])

    // In PostgreSQL en_US.UTF-8, LOWER('İ') is 'i' (matching ILIKE), whereas JS 'İ'.toLowerCase() is 'i\u0307'.
    const { results: dottedIResults } = await searchTopicAliases({
      prefixQuery: `İSTANBUL-${id.toUpperCase()}`,
    })
    expect(dottedIResults.map(result => result.alias)).toEqual([dottedI])
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
