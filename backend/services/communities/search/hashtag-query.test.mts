import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestUser,
  insertTestTopic,
  insertTopicAliasForTest,
  insertUnlinkedTopicAliasForTest,
} from '@voucha/test-helpers'
import { resolveCommunityHashtagQuery } from './hashtag-query.mts'

describe('resolveCommunityHashtagQuery', () => {
  it('passes plain text through with no topics and no missing hashtag', async () => {
    const result = await resolveCommunityHashtagQuery('book club')

    expect(result).toEqual({ search: 'book club', topicIds: [], hashtagHasNoMatches: false })
  })

  it('links a hashtag to its topic and keeps the remaining text', async () => {
    const owner = await createTestUser()
    const suffix = createRandomString(8)
    const topicId = await insertTestTopic({
      name: `Hashtag query topic ${suffix}`,
      slug: `hashtag-query-topic-${suffix}`,
      createdById: owner.id,
    })
    const alias = `hashtag-query-alias-${suffix}`
    await insertTopicAliasForTest(topicId, alias)

    const result = await resolveCommunityHashtagQuery(`gardening #${alias}`)

    expect(result).toEqual({ search: 'gardening', topicIds: [topicId], hashtagHasNoMatches: false })
  })

  it('reports no matches for a hashtag that names no topic', async () => {
    const result = await resolveCommunityHashtagQuery(`#nothing${createRandomString(10)}`)

    expect(result).toMatchObject({ topicIds: [], hashtagHasNoMatches: true })
  })

  it('reports no matches for a hashtag that is only an unlinked alias', async () => {
    const alias = `unlinked-${createRandomString(10)}`
    await insertUnlinkedTopicAliasForTest(alias)

    const result = await resolveCommunityHashtagQuery(`#${alias}`)

    expect(result).toMatchObject({ topicIds: [], hashtagHasNoMatches: true })
  })
})
