import { describe, expect, it, vi } from 'vitest'
import type { BasicUser } from '@services/users/types'
import { toolsSearchPostsSemantic } from '@services/posts/tools/semantic'
import { VALID_FILTERABLE_POST_TYPES } from '@ts-shared/feed-capabilities'
import searchPostsTool from './search-posts.mts'
import searchPostsSemanticTool, { createSearchPostsSemanticTool } from './search-posts-semantic.mts'

describe('search-posts-semantic tool', () => {
  it('has correct schema name', () => {
    expect(searchPostsSemanticTool.schema.name).toBe('search_posts_semantic')
  })

  it.each([searchPostsTool, searchPostsSemanticTool])(
    '$schema.name filters by the post types GET /api/v1/posts accepts',
    tool => {
      const parameters = tool.schema.parameters as {
        properties: Record<string, { enum?: unknown }>
      }

      expect(parameters.properties.post_type?.enum).toEqual([...VALID_FILTERABLE_POST_TYPES])
    },
  )

  it('maps public arguments and wraps the semantic search result', async () => {
    const currentUser: BasicUser = {
      __entity_type: 'user',
      id: crypto.randomUUID(),
      roles: ['administrator'],
    }
    const results = [
      {
        id: crypto.randomUUID(),
        title: 'Credit card rewards',
        markdown: 'A comparison of credit card rewards.',
        post_type: 'review',
        distance: 0.1,
      },
    ]
    const searchPostsSemantic = vi.fn<typeof toolsSearchPostsSemantic>().mockResolvedValue(results)
    const tool = createSearchPostsSemanticTool({ toolsSearchPostsSemantic: searchPostsSemantic })

    const result = await tool.function(currentUser)({
      semantic_search_query: 'credit card rewards',
      limit: 100,
      post_type: 'story',
    })

    expect(searchPostsSemantic).toHaveBeenCalledWith({
      query: 'credit card rewards',
      limit: 10,
      postType: 'story',
      currentUserId: currentUser.id,
      isAdministrator: true,
    })
    expect(result).toEqual({ success: true, results })
  })
})
