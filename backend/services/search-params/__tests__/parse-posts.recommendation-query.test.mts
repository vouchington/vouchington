import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestTopic,
  insertUnlinkedTopicAliasForTest,
} from '@voucha/test-helpers'
import { parsePostsSearchParams } from '../parse-posts.mts'

const slug = () => `rec-query-${crypto.randomUUID()}`
async function topic() {
  const user = await createTestUser()
  const key = slug()
  return { id: await insertTestTopic({ name: key, slug: key, createdById: user.id }), slug: key }
}

describe('recommendation-only literal query parsing', () => {
  it.each(['unknown', 'linked', 'unlinked'])(
    'keeps %s hashtags as literal recommendation text',
    async kind => {
      const tag = kind === 'linked' ? (await topic()).slug : slug()
      if (kind === 'unlinked') await insertUnlinkedTopicAliasForTest(tag)
      const q = `#${tag}`
      const { shouldReturnEmpty, searchOptions } = await parsePostsSearchParams({
        post_types: 'topic_recommendation',
        q,
      })
      expect(shouldReturnEmpty).toBe(false)
      expect(searchOptions.topic_recommendation_q).toBe(q)
      expect(searchOptions.text_search_query).toBeUndefined()
      expect(searchOptions.universal_topic_ids).toBeUndefined()
      expect(searchOptions.hashtag_alias_ids).toBeUndefined()
    },
  )

  it('retains explicit topic and category filters independently of literal hashtags', async () => {
    const [first, second] = await Promise.all([topic(), topic()])
    const { shouldReturnEmpty, searchOptions } = await parsePostsSearchParams({
      post_types: 'topic_recommendation',
      q: `#${second.slug}`,
      topics: [first.slug],
      category: second.slug,
    })
    expect(shouldReturnEmpty).toBe(false)
    expect(searchOptions.universal_topic_ids).toEqual([first.id])
    expect(searchOptions.related_topic_ids).toEqual([second.id])
    expect(
      (
        await parsePostsSearchParams({
          post_types: 'topic_recommendation',
          q: `#${slug()}`,
          topic: slug(),
        })
      ).shouldReturnEmpty,
    ).toBe(true)
  })

  it('retains generic hashtag semantics for mixed post types', async () => {
    const known = await topic()
    const result = await parsePostsSearchParams({
      post_types: 'topic_recommendation,discussion',
      q: `#${known.slug}`,
    })
    expect(result.shouldReturnEmpty).toBe(false)
    expect(result.searchOptions.universal_topic_ids).toEqual([known.id])
    expect(result.searchOptions.topic_recommendation_q).toBeUndefined()
    expect(
      (
        await parsePostsSearchParams({
          post_types: 'topic_recommendation,discussion',
          q: `#${slug()}`,
        })
      ).shouldReturnEmpty,
    ).toBe(true)
  })

  it('counts only actual topic references against the unchanged five-term cap', async () => {
    const q = Array.from({ length: 6 }, () => `#${slug()}`).join(' ')
    const literal = await parsePostsSearchParams({ post_types: 'topic_recommendation', q })
    expect(literal.shouldReturnEmpty).toBe(false)
    expect(literal.searchOptions.topic_recommendation_q).toBe(q)
    await expect(
      parsePostsSearchParams({ post_types: 'topic_recommendation,discussion', q }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      parsePostsSearchParams({
        post_types: 'topic_recommendation',
        topics: Array.from({ length: 6 }, slug),
      }),
    ).rejects.toMatchObject({ status: 400 })
  })
})
