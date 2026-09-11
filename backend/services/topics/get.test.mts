import { expect, it, describe } from 'vitest'
import { getTopicByAny } from './get.mts'
import { createTestUser } from '@voucha/test-helpers'
import { createTopic } from './create.mts'
import { createTopicAliases } from './aliases.mts'

describe('get', () => {
  it('retrieves topic by slug (case insensitive)', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topic = await createTopic(user!, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    const result = await getTopicByAny(topic.slug.toUpperCase())

    expect(result).toBeDefined()
    expect(result?.id).toBe(topic.id)
    expect(result?.slug).toBe(topic.slug)
  })

  it('retrieves topic by alias (case insensitive)', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topic = await createTopic(user!, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    const alias = `alias-${random}`
    await createTopicAliases(topic.id, alias)

    const result = await getTopicByAny(alias.toUpperCase())

    expect(result).toBeDefined()
    expect(result?.id).toBe(topic.id)
    expect(result?.slug).toBe(topic.slug)
  })
})
