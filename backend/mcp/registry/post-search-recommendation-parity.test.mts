import { describe, expect, it } from 'vitest'
import { createRandomString, createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { callStructuredMcpTool, optionArgs } from '@voucha/test-helpers/mcp-tool-contract'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'

describe('post search recommendation discovery', () => {
  it('returns the same owned and private recommendation visibility through REST and MCP', async () => {
    const owner = await createTestUser()
    const stranger = await createTestUser()
    const suffix = createRandomString(8).toLowerCase()
    const privateRecommendationId = await insertTestPost({
      title: `Private recommendation ${suffix}`,
      slug: `private-recommendation-${suffix}`,
      markdown: 'Private recommendation',
      createdById: owner.id,
      postType: 'topic_recommendation',
      privacy: 'private',
      broadcast: 'followers',
      clearanceStatus: 'approved',
    })
    const publicRecommendationId = await insertTestPost({
      title: `Public recommendation ${suffix}`,
      slug: `public-recommendation-${suffix}`,
      markdown: 'Public recommendation',
      createdById: owner.id,
      postType: 'topic_recommendation',
      privacy: 'public',
      broadcast: 'everyone',
      clearanceStatus: 'approved',
    })

    for (const [user, visible] of [
      [owner, true],
      [stranger, false],
    ] as const) {
      const request = createRequest()
      await request.authenticateAs(user)
      const rest = await request
        .get(`/api/v1/posts?creator=${owner.id}&post_types=topic_recommendation&time_range=all`)
        .expect(200)
      const mcp = await callStructuredMcpTool(
        { ...user, membership_plan: null },
        'read_posts',
        optionArgs('search', {
          creator: owner.id,
          post_type: 'topic_recommendation',
          time_range: 'all',
        }),
        ['posts:read'],
      )
      const restIds = (rest.body.results as Array<{ id: string }>).map(row => row.id)
      const mcpIds = (mcp.results as Array<{ id: string }>).map(row => row.id)
      expect(mcpIds).toEqual(restIds)
      expect(mcpIds.includes(privateRecommendationId)).toBe(visible)
      expect(mcpIds).toContain(publicRecommendationId)
      const mcpPage = mcp.page_info as {
        start_cursor: string
        end_cursor: string | null
        has_next_page: boolean
      }
      const restPage = rest.body.page_info as {
        start_cursor: string
        end_cursor: string | null
        has_next_page: boolean
      }
      expect(mcpPage.start_cursor).toBe(restPage.start_cursor)
      expect(mcpPage.has_next_page).toBe(restPage.has_next_page)
      const stringCursor = expect.any(String)
      const expectedEndCursor = mcpPage.has_next_page ? stringCursor : null
      expect(mcpPage.end_cursor).toEqual(expectedEndCursor)
      expect(restPage.end_cursor).toEqual(expectedEndCursor)
      if (!mcpPage.has_next_page || !mcpPage.end_cursor || !restPage.end_cursor) continue

      const mcpContinuation = await callStructuredMcpTool(
        { ...user, membership_plan: null },
        'read_posts',
        optionArgs('search', {
          creator: owner.id,
          post_type: 'topic_recommendation',
          time_range: 'all',
          after: restPage.end_cursor,
        }),
        ['posts:read'],
      )
      expect(mcpContinuation.success).toBe(true)
      await request
        .get('/api/v1/posts')
        .query({
          creator: owner.id,
          post_types: 'topic_recommendation',
          time_range: 'all',
          after: mcpPage.end_cursor,
        })
        .expect(200)
    }
  })
})
