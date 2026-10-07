import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import { resolveTopic, resolveTopics } from './resolve-topic.mts'

describe('resolveTopic and resolveTopics', () => {
  const suffix = crypto.randomUUID().slice(0, 8)
  const slug = `resolve-topic-${suffix}`
  let topicId: string

  beforeAll(async () => {
    const user = await createTestUser()
    topicId = await insertTestTopic({ name: `Resolve Topic ${suffix}`, slug, createdById: user.id })
  })

  it.each([
    ['its id', () => topicId],
    ['its slug', () => slug],
    ['its slug with surrounding space and capitals', () => ` ${slug.toUpperCase()} `],
  ])('resolves a topic by %s', async (_, identifier) => {
    const topic = await resolveTopic(identifier())

    expect(topic?.id).toBe(topicId)
  })

  it.each([
    ['an unknown slug', `unknown-topic-${suffix}`],
    ['a value that is neither a UUID nor a slug', 'Not a slug!'],
  ])('resolves %s to null', async (_, identifier) => {
    await expect(resolveTopic(identifier)).resolves.toBeNull()
  })

  it('resolves several identifiers in input order, with null for each one that names no topic', async () => {
    const topics = await resolveTopics([
      'Not a slug!',
      ` ${slug.toUpperCase()} `,
      `unknown-topic-${suffix}`,
      topicId,
    ])

    expect(topics.map(topic => topic?.id ?? null)).toEqual([null, topicId, null, topicId])
  })

  it('resolves only invalid identifiers to nulls', async () => {
    await expect(resolveTopics(['Not a slug!', ''])).resolves.toEqual([null, null])
  })
})
