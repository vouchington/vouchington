import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestTopic,
  insertUnlinkedTopicAliasForTest,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { insertScoredPostTopicCategoryRelation } from '@voucha/test-helpers/entities/entity-relations-posts'
import { createTestTopicRecommendation } from '@voucha/test-helpers/topic-recommendation-fixtures'
import { createRequest } from '@voucha/test-helpers/api/server'
import { callStructuredMcpTool, optionArgs } from '@voucha/test-helpers/mcp-tool-contract'
import { prepareTopicRecommendation } from '@services/topic-recommendations/create-topic-recommendation'

const tag = () => `query-${crypto.randomUUID()}`

describe('recommendation q REST and MCP parity', () => {
  it('finds unknown, linked, and unlinked literal hashtags while preserving explicit and mixed filters', async () => {
    const user = await createTestUser()
    const known = await createTestTopic()
    const alias = tag()
    await insertUnlinkedTopicAliasForTest(alias)
    const unknown = tag()
    const queries = [`#${unknown}`, `#${known.slug}`, `#${alias}`]
    const recommendations = []
    for (const q of queries) {
      recommendations.push(
        await createTestTopicRecommendation(
          prepareTopicRecommendation,
          user,
          WEB_PROVENANCE,
          {
            markdown: 'Proposed topic rationale.',
            topic_title: `Proposed ${q}`,
            topic_slug: tag(),
          },
          { skipCreatedEvents: true },
        ),
      )
    }
    const request = createRequest()
    await request.authenticateAs(user)
    const paired = async (q: string, extra: Record<string, unknown> = {}) => {
      const rest = await request
        .get('/api/v1/posts')
        .query({ post_types: 'topic_recommendation', creator: user.id, q, ...extra })
        .expect(200)
      const result = await callStructuredMcpTool(
        { ...user, membership_plan: null },
        'read_posts',
        optionArgs('search', { post_type: 'topic_recommendation', creator: user.id, q, ...extra }),
        ['posts:read'],
      )
      const ids = (result.results as { id: string }[]).map(row => row.id)
      expect(ids).toEqual(rest.body.results.map((row: { id: string }) => row.id))
      return ids
    }
    for (const [index, q] of queries.entries())
      expect(await paired(q)).toEqual([recommendations[index]!.id])
    expect(await paired(queries[0]!, { post_types: ['topic_recommendation'] })).toEqual([
      recommendations[0]!.id,
    ])
    expect(await paired(queries[1]!, { topic: known.id })).toEqual([])
    expect(await paired(queries[1]!, { category: known.id })).toEqual([])
    await insertScoredPostTopicCategoryRelation(recommendations[1]!.id, known.id, user.id)
    expect(await paired(queries[1]!, { topics: [known.id] })).toEqual([recommendations[1]!.id])
    expect(await paired(queries[1]!, { category: known.id })).toEqual([recommendations[1]!.id])
    expect(await paired(queries[1]!, { categories: [known.id] })).toEqual([recommendations[1]!.id])
    expect(await paired(queries[1]!, { topic: tag() })).toEqual([])
    const mixed = { post_types: ['topic_recommendation', 'discussion'] }
    expect(await paired(queries[0]!, mixed)).toEqual([])
    expect(await paired(queries[1]!, mixed)).toEqual([recommendations[1]!.id])
    const literal = Array.from({ length: 6 }, () => `#q${crypto.randomUUID().slice(0, 8)}`).join(
      ' ',
    )
    const literalPost = await createTestTopicRecommendation(
      prepareTopicRecommendation,
      user,
      WEB_PROVENANCE,
      { markdown: 'Proposal rationale.', topic_title: literal, topic_slug: tag() },
      { skipCreatedEvents: true },
    )
    expect(await paired(literal)).toEqual([literalPost.id])
  })
})
