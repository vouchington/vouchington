import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { getPostByAny } from '@services/posts'
import type { BasicUser } from '@voucha/types/entities/user'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { createRecommendation } from './create-compatibility-recommendation.mts'
import { prepareTopicRecommendation } from './create-topic-recommendation.mts'

describe('createRecommendation', () => {
  let user: BasicUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('throws TypeError when extraction_confidence is not a finite number between 0 and 1', async () => {
    const rand = `compat-conf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await expect(
      createRecommendation(user, {
        source_entity_type: 'post',
        source_entity_id: `post-${rand}`,
        wikipedia_pageid: rand,
        wikipedia_title: 'Test Article',
        wikipedia_url: `https://en.wikipedia.org/wiki/Test_${rand}`,
        suggested_topic_name: 'Test Topic',
        suggested_topic_slug: `test-topic-${rand}`,
        extraction_method: 'llm_extraction',
        extraction_keyword: 'test',
        extraction_confidence: 2,
      }),
    ).rejects.toThrow(
      new TypeError('extraction_confidence must be a finite number between 0 and 1'),
    )
  })

  it('adds the wikipedia_title as an alias when it differs from suggested_topic_name', async () => {
    const rand = `compat-alias-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const result = await createRecommendation(user, {
      source_entity_type: 'post',
      source_entity_id: `post-${rand}`,
      wikipedia_pageid: rand,
      wikipedia_title: 'Albert Einstein',
      wikipedia_url: `https://en.wikipedia.org/wiki/Albert_Einstein_${rand}`,
      suggested_topic_name: 'Einstein',
      suggested_topic_slug: `einstein-${rand}`,
      extraction_method: 'llm_extraction',
      extraction_keyword: 'einstein',
      extraction_confidence: 0.9,
    })
    expect(result).toMatchObject({ id: expect.any(String) })

    const post = await getPostByAny(result!.id)
    expect(post?.topic_recommendation?.aliases).toContain('albert einstein')
  })

  it('defers topic-recommendation created effects until finalization', async () => {
    const random = `prepared-topic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const originalAdd = entityCacheBloomFilters.posts.add
    const add = vi.fn<typeof entityCacheBloomFilters.posts.add>()

    entityCacheBloomFilters.posts.add = add
    try {
      const prepared = await prepareTopicRecommendation(user, {
        title: `Add topic: ${random}`,
        markdown: 'A proposed topic needs review.',
        topic_title: `Prepared ${random}`,
        topic_slug: `prepared-${random}`,
        topic_hostname: `${random}.example.com`,
        topic_hostnames: [`${random}.example.com`],
      })

      expect(prepared.response.post_type).toBe('topic_recommendation')
      expect(add).not.toHaveBeenCalledWith([prepared.response.id])
      await prepared.finalize()
      expect(add).toHaveBeenCalledWith([prepared.response.id])
    } finally {
      entityCacheBloomFilters.posts.add = originalAdd
    }
  })
})
