import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import { describe, it, expect } from 'vitest'
import searchTopicsTextTool from './search-topics-text.mts'

describe('search-topics-text tool', () => {
  it('has correct schema name', () => {
    expect(searchTopicsTextTool.schema.name).toBe('search_topics_text')
  })

  it('returns success with matching topics', async () => {
    const topic = await createTestTopic({ name: `Agent Search Text Topic ${crypto.randomUUID()}` })
    const executor = searchTopicsTextTool.function(null as never)
    const result = await executor({ query: 'Agent Search Text Topic' })

    expect(result.success).toBe(true)
    expect(result.topics).toContainEqual(
      expect.objectContaining({ id: topic.id, name: topic.name, slug: topic.slug }),
    )
  })

  it('clamps limit to max 25', async () => {
    const marker = `Agent Search Limit Topic ${crypto.randomUUID()}`
    const user = await createTestUser()
    if (!user) throw new Error('Failed to create test user')
    for (const index of Array.from({ length: 30 }, (_, value) => value)) {
      await createTestTopic({ user, name: `${marker} ${index.toString().padStart(2, '0')}` })
    }
    const executor = searchTopicsTextTool.function(null as never)
    const result = await executor({ query: marker, limit: 100 })

    expect(result.topics).toHaveLength(25)
  })

  it('uses default limit of 10 when not provided', async () => {
    const marker = `Agent Search Default Topic ${crypto.randomUUID()}`
    const user = await createTestUser()
    if (!user) throw new Error('Failed to create test user')
    for (const index of Array.from({ length: 12 }, (_, value) => value)) {
      await createTestTopic({ user, name: `${marker} ${index.toString().padStart(2, '0')}` })
    }
    const executor = searchTopicsTextTool.function(null as never)
    const result = await executor({ query: marker })

    expect(result.topics).toHaveLength(10)
  })
})
