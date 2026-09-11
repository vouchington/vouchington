import { describe, expect, it, vi } from 'vitest'
import type { BasicUser } from '@services/users/types'
import { toolsSearchPostsSemantic } from '@services/posts/tools/semantic'
import searchPostsSemanticTool, { createSearchPostsSemanticTool } from './search-posts-semantic.mts'

describe('search-posts-semantic tool', () => {
  it('has correct schema name', () => {
    expect(searchPostsSemanticTool.schema.name).toBe('search_posts_semantic')
  })

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
      query: 'credit card rewards',
      limit: 100,
      post_type: 'review',
    })

    expect(searchPostsSemantic).toHaveBeenCalledWith({
      query: 'credit card rewards',
      limit: 10,
      postType: 'review',
      currentUserId: currentUser.id,
      isAdministrator: true,
    })
    expect(result).toEqual({ success: true, results })
  })
})
