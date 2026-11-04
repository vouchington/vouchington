import { optionArgs, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPost,
} from '@voucha/test-helpers'

const DAY_MS = 24 * 60 * 60 * 1000

describe('read_community posts time range', () => {
  it('reads 30 days by default and honors an explicit range, like the REST route', async () => {
    const owner = await createTestUser()
    const caller = { ...owner, membership_plan: null }
    const community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const postIds: string[] = []
    for (const age of [2, 40]) {
      const postId = await insertTestPost({
        communityId: community.id,
        createdAt: new Date(Date.now() - age * DAY_MS),
        createdById: owner.id,
        markdown: `Mcp time range ${age}`,
        slug: `mcp-time-range-${createRandomString(8)}`,
        title: `Mcp time range ${age}`,
      })
      await insertTestCommunityPostReview({
        communityId: community.id,
        postId,
        submittedById: owner.id,
      })
      postIds.push(postId)
    }
    const read = async (args: Record<string, unknown>) => {
      const result = await callStructuredMcpTool(
        caller,
        'read_community',
        optionArgs('posts', { community_id: community.id, ...args }),
        ['communities:read'],
      )
      return (result.results as { id: string }[]).map(post => post.id)
    }

    expect(await read({})).toEqual([postIds[0]])
    expect(await read({ sort: 'hot' })).toEqual([postIds[0]])
    expect(await read({ time_range: '1y' })).toEqual([postIds[0], postIds[1]])
    expect(await read({ time_range: 'all' })).toEqual([postIds[0], postIds[1]])
  })
})
