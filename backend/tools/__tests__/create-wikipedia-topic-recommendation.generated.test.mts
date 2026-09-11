import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser, createSystemUser } from '@voucha/test-helpers'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import { getPostByAny } from '@services/posts'
import { createPost } from '@services/posts/create'
import type { PrivateUser } from '@services/users/types'
import createWikipediaTopicRecommendationTool from '../create-wikipedia-topic-recommendation.mts'
let sourceUser: PrivateUser
let wikipediaAgentUser: PrivateUser

describe('create-wikipedia-topic-recommendation tool', () => {
  beforeAll(async () => {
    sourceUser = await createTestUser()
    const systemUser = await createSystemUser(`wikipedia-agent-${crypto.randomUUID().slice(0, 8)}`)
    wikipediaAgentUser = systemUser as PrivateUser
  })
  it('creates a post-backed topic recommendation from wikipedia metadata', async () => {
    const randomRaw = Math.random().toString(36).slice(2, 10)
    // Pre-capitalize so the title is already in title case — avoids coupling the
    // assertion to the toTitleCase production helper (char0.upper + rest.lower).
    const random = randomRaw.charAt(0).toUpperCase() + randomRaw.slice(1)
    const pageId = Math.floor(Math.random() * 1000000000)
    const title = `Crimson Voyager Rewards ${random}`
    const sourcePost = await createPost(sourceUser, {
      title: `Post about ${title}`,
      markdown: `This post discusses ${title} and travel loyalty.`,
      post_type: 'discussion',
    })
    const execute = createWikipediaTopicRecommendationTool.function(
      wikipediaAgentUser,
      'post',
      sourcePost.id,
    )

    const result = await execute({
      wikipedia_pageid: pageId,
      wikipedia_title: title,
      wikipedia_url: `https://en.wikipedia.org/wiki/Crimson_Voyager_Rewards_${random}`,
      wikipedia_extract: `${title} is a travel loyalty program.`,
      wikipedia_description: 'Travel loyalty program',
      extraction_keyword: title,
      confidence: 0.92,
    })

    expect(result.created).toBe(true)
    if (!result.created) return

    const recommendation = await getPostByAny(result.recommendation_id)
    expect(recommendation?.post_type).toBe('topic_recommendation')
    expect(recommendation?.title).toBe(`Add topic: ${title}`)
    expect(recommendation?.markdown).toContain(`Wikipedia page ID: ${pageId}`)
    expect(recommendation?.markdown).toContain('Confidence: 0.92')
    expect(recommendation?.topic_recommendation?.hostname?.hostname).toBe('en.wikipedia.org')
    expect(
      recommendation?.topic_recommendation?.hostnames.map(
        (hostname: { hostname: string }) => hostname.hostname,
      ),
    ).toContain('en.wikipedia.org')
    expect(recommendation?.topic_recommendation?.topic_wikipedia_pageid).toBe(String(pageId))
    expect(recommendation?.topic_recommendation?.topic_markdown).toContain(
      `${title} is a travel loyalty program.`,
    )
    const topicSlug = recommendation?.topic_recommendation?.topic_slug as string
    expect(typeof topicSlug).toBe('string')
    expect(topicSlug).toMatch(/^crimson-voyager-rewards-/)
    expect(topicSlug).toContain(randomRaw)
  })

  it('dedupes by wikipedia page id even if title and URL change', async () => {
    const uniqueTitle = `AAdvantage ${Date.now()}`
    const uniqueSlugBase = `aadvantage-${Date.now()}`
    const sourcePost = await createPost(sourceUser, {
      title: 'Another post about Marriott Bonvoy',
      markdown: 'This post also discusses Marriott Bonvoy.',
      post_type: 'discussion',
    })
    const execute = createWikipediaTopicRecommendationTool.function(
      wikipediaAgentUser,
      'post',
      sourcePost.id,
    )

    const dedupPageId = Math.floor(Math.random() * 1000000000)
    const firstResult = await execute({
      wikipedia_pageid: dedupPageId,
      wikipedia_title: uniqueTitle,
      wikipedia_url: `https://en.wikipedia.org/wiki/${uniqueSlugBase}`,
      extraction_keyword: uniqueTitle,
      confidence: 0.91,
    })

    expect(firstResult.created).toBe(true)

    const secondResult = await execute({
      wikipedia_pageid: dedupPageId,
      wikipedia_title: `${uniqueTitle} program`,
      wikipedia_url: `https://en.wikipedia.org/wiki/${uniqueSlugBase}_(program)`,
      extraction_keyword: uniqueTitle,
      confidence: 0.93,
    })

    expect(secondResult).toMatchObject({
      created: false,
      reason: 'duplicate',
    })
  })

  it('returns duplicate when the topic already exists', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const topicName = `Existing Topic ${random}`
    const topicSlug = `existing-topic-${random}`
    await insertTestTopic({
      name: topicName,
      slug: topicSlug,
      createdById: sourceUser.id,
    })
    const sourcePost = await createPost(sourceUser, {
      title: `Post about ${topicName}`,
      markdown: 'This post discusses an existing topic.',
      post_type: 'discussion',
    })
    const execute = createWikipediaTopicRecommendationTool.function(
      wikipediaAgentUser,
      'post',
      sourcePost.id,
    )

    const result = await execute({
      wikipedia_pageid: Math.floor(Math.random() * 1000000000),
      wikipedia_title: topicName,
      wikipedia_url: `https://en.wikipedia.org/wiki/${topicSlug}`,
      extraction_keyword: topicName,
      confidence: 0.88,
    })

    expect(result).toMatchObject({
      created: false,
      reason: 'duplicate',
    })
  })
})
