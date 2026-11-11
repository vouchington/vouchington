import { describe, expect, it } from 'vitest'
import { createTestUser, createTestUrlWithHostname, WEB_PROVENANCE } from '@voucha/test-helpers'
import { createTestTopicRecommendation } from '@voucha/test-helpers/topic-recommendation-fixtures'
import { insertHackerNewsReferencesForTest } from '@voucha/test-helpers/hacker-news-references'
import { insertHackerNewsRelatedUrlsForTest } from '@voucha/test-helpers/hacker-news-related-urls'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { prepareTopicRecommendation } from '@services/topic-recommendations'
import { hackerNewsVisibilityConfig } from '@services/urls/hacker-news-visibility-config'
import { callStructuredMcpTool, optionArgs } from '@voucha/test-helpers/mcp-tool-contract'

const scopes = ['posts:read', 'posts:write'] as const

describe('MCP recommendation mutation Hacker News parity', () => {
  it('returns the same neutral counts on an update and a list, omitting both while hidden', async () => {
    const caller = { ...(await createTestUser()), membership_plan: 'plus' as const }
    const suffix = crypto.randomUUID().replaceAll('-', '')
    const recommendation = await createTestTopicRecommendation(
      prepareTopicRecommendation,
      caller,
      WEB_PROVENANCE,
      {
        markdown: `Example ${suffix}`,
        topic_title: `Example ${suffix}`,
        topic_slug: `example-${suffix}`,
      },
    )
    const urlId = await createTestUrlWithHostname()
    await insertHackerNewsReferencesForTest({ url_id: urlId, story_count: 2, comment_count: 3 })
    await insertHackerNewsRelatedUrlsForTest(recommendation.id, caller.id, [{ urlId, up: 1 }])
    for (const visible of [true, false]) {
      const restore = overrideDynamicConfigFieldsForTest(hackerNewsVisibilityConfig, {
        references_visible: visible,
      })
      try {
        const updated = await callStructuredMcpTool(
          caller,
          'act_on_post',
          optionArgs('edit', {
            id: recommendation.id,
            topic_title: `Updated ${visible} ${suffix}`,
          }),
          scopes,
        )
        const listed = await callStructuredMcpTool(
          caller,
          'read_posts',
          optionArgs('search', {
            creator: caller.id,
            post_type: 'topic_recommendation',
            time_range: 'all',
          }),
          scopes,
        )
        const mutationPost = updated.post as Record<string, unknown>
        const listedPost = (listed.results as Array<Record<string, unknown>>).find(
          post => post.id === recommendation.id,
        )!
        const expected = visible ? { story_count: 2, comment_count: 3 } : undefined
        expect(mutationPost.hacker_news_references).toEqual(expected)
        expect(listedPost.hacker_news_references).toEqual(expected)
        expect(mutationPost.title).toEqual(listedPost.title)
        expect(listedPost).not.toHaveProperty('markdown')
      } finally {
        restore()
      }
    }
  })
})
