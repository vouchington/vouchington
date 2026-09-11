import { expect, it, describe } from 'vitest'
import { toolsSearchTopicsText } from './text.mts'
import { createTestUser, createTestTopic } from '@voucha/test-helpers'
import { mergeTopicAliases } from '@services/topics/merge-aliases'
import { getTopicByAny } from '@services/topics/get'

describe('text', () => {
  const suffix = Math.random().toString(36).slice(2, 10)
  it('returns topics matching text search by name', async () => {
    const user = await createTestUser()
    const name = `Credit Cards ${suffix}`
    const topic = await createTestTopic({ user: user, name })

    const results = await toolsSearchTopicsText(name, 10)

    const topicIds = results.map(r => r.id)
    expect(topicIds).toContain(topic.id)
  })

  it('returns topics matching text search by slug', async () => {
    const user = await createTestUser()
    const slug = `amex-${suffix}`
    const topic = await createTestTopic({ user: user, name: `American Express ${suffix}`, slug })

    const results = await toolsSearchTopicsText(slug, 10)

    const topicIds = results.map(r => r.id)
    expect(topicIds).toContain(topic.id)
  })

  it('returns empty array when no matches found', async () => {
    const results = await toolsSearchTopicsText(`nonexistent-topic-xyz-${suffix}`, 10)

    expect(results).toEqual([])
  })

  it('result has correct structure', async () => {
    const user = await createTestUser()
    const name = `Structure Topic ${suffix}`
    await createTestTopic({ user: user, name })

    const results = await toolsSearchTopicsText(name, 10)

    expect(results.length).toBeGreaterThan(0)
    expect(results[0]).toHaveProperty('id')
    expect(results[0]).toHaveProperty('name')
    expect(results[0]).toHaveProperty('slug')
    expect(results[0]).toHaveProperty('topic_type')
  })

  it('limits results to specified limit', async () => {
    const user = await createTestUser()
    const keyword = `Limtest${suffix}`
    await createTestTopic({ user: user, name: `${keyword} A` })
    await createTestTopic({ user: user, name: `${keyword} B` })
    await createTestTopic({ user: user, name: `${keyword} C` })

    const results = await toolsSearchTopicsText(keyword, 2)

    expect(results.length).toBeLessThanOrEqual(2)
  })

  it('respects max limit of 25', async () => {
    const results = await toolsSearchTopicsText(`topic-${suffix}`, 100)

    // Should be capped at 25 even though we requested 100
    expect(results.length).toBeLessThanOrEqual(25)
  })

  it('prioritizes name prefix matches over contains matches', async () => {
    const user = await createTestUser()
    const keyword = `Cardkw${suffix}`
    const prefixTopic = await createTestTopic({ user: user, name: `${keyword} Benefits` })
    const containsTopic = await createTestTopic({ user: user, name: `Credit ${keyword}` })

    const results = await toolsSearchTopicsText(keyword, 10)

    const topicIds = results.map(r => r.id)
    const prefixIndex = topicIds.indexOf(prefixTopic.id)
    const containsIndex = topicIds.indexOf(containsTopic.id)

    // Prefix match should come before contains match
    expect(prefixIndex).toBeGreaterThan(-1)
    expect(containsIndex).toBeGreaterThan(-1)
    expect(prefixIndex).toBeLessThan(containsIndex)
  })

  it('excludes merged topics from text search results', async () => {
    const admin = await createTestUser({ administrator: true })
    const marker = `merged-text-${suffix}`
    const source = await createTestTopic({ user: admin, name: `Source ${marker}` })
    const destination = await createTestTopic({ user: admin, name: `Destination ${marker}` })
    const fullSource = await getTopicByAny(source.id)
    const fullDestination = await getTopicByAny(destination.id)
    if (!fullSource || !fullDestination) throw new Error('Test topics not found')

    await mergeTopicAliases(admin, fullSource, fullDestination)

    const results = await toolsSearchTopicsText(marker, 25)
    const ids = results.map(r => r.id)
    expect(ids).not.toContain(source.id)
    expect(ids).toContain(destination.id)
  })
})
