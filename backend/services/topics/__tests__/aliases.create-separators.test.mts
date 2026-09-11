import { it, expect, describe } from 'vitest'
import { createTopicAliases } from '../aliases.mts'
import { getTopicAliases } from '../get-topic-aliases.mts'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'

describe('createTopicAliases — string separators', () => {
  it('creates multiple aliases from newline-separated string', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      createdById: user!.id,
    })
    await createTopicAliases(topicId, `alias1-${random}\nalias2-${random}\nalias3-${random}`)
    const { results: aliases } = await getTopicAliases(topicId)

    expect(aliases).toContain(`alias1-${random}`)
    expect(aliases).toContain(`alias2-${random}`)
    expect(aliases).toContain(`alias3-${random}`)
  })

  it('creates multiple aliases from CRLF newline-separated string', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      createdById: user!.id,
    })
    await createTopicAliases(topicId, `alias1-${random}\r\nalias2-${random}\r\nalias3-${random}`)
    const { results: aliases } = await getTopicAliases(topicId)

    expect(aliases).toContain(`alias1-${random}`)
    expect(aliases).toContain(`alias2-${random}`)
    expect(aliases).toContain(`alias3-${random}`)
  })
})
