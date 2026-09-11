import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createRandomString,
  insertTestTopic,
  topicSearchVectorMatchesQuery,
} from '@voucha/test-helpers'

// topics.search_vector is a GENERATED ALWAYS STORED column (0060-00-00-topics-taxonomy.sql)
// computed from name/slug/aliases/markdown via to_tsvector('voucha_english', ...). No service
// queries it via FTS today — topic listing (query-builder-where.mts) and the LLM tool search
// (tools/text.mts) both match name/slug with plain ILIKE — so this asserts the generated-column
// write path directly, exercising the voucha_english config's unaccent mapping end to end.
describe('topics.search_vector unaccent folding', () => {
  it('folds diacritics in the generated search_vector so an unaccented query matches', async () => {
    const user = await createTestUser()
    const random = createRandomString(10)

    const topicId = await insertTestTopic({
      name: `José Ñandú ${random}`,
      slug: `jose-nandu-${random}`,
      createdById: user.id,
    })

    expect(await topicSearchVectorMatchesQuery(topicId, `Jose Nandu ${random}`)).toBe(true)
  })

  it('still matches the accented query as-is', async () => {
    const user = await createTestUser()
    const random = createRandomString(10)

    const topicId = await insertTestTopic({
      name: `Beyoncé ${random}`,
      slug: `beyonce-${random}`,
      createdById: user.id,
    })

    expect(await topicSearchVectorMatchesQuery(topicId, `Beyoncé ${random}`)).toBe(true)
  })

  it('folds diacritics in the aliases array so an unaccented query matches', async () => {
    const user = await createTestUser()
    const random = createRandomString(10)

    const topicId = await insertTestTopic({
      name: `Topic ${random}`,
      slug: `topic-${random}`,
      createdById: user.id,
      aliases: [`José Ñandú ${random}`],
    })

    expect(await topicSearchVectorMatchesQuery(topicId, `Jose Nandu ${random}`)).toBe(true)
  })
})
