import { describe, expect, it } from 'vitest'
import { createTestPost, createTestUser } from '@voucha/test-helpers'
import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'

describe('get_post_descendants database failure', () => {
  it('reports a database failure instead of an invalid cursor and returns the page on retry', async () => {
    const caller = { ...(await createTestUser()), membership_plan: null }
    const post = await createTestPost({ user: caller })
    const reply = await createTestPost({
      user: caller,
      post_type: 'comment',
      parent_post_id: post.id,
    })
    const args = { post_id: post.id }

    const { result, error } = await withPostgresPoolQueryFailureForTest(
      '/* getVisibleCommentDescendantIdsPage */',
      () => callRejectedMcpTool(caller, 'get_post_descendants', args, ['posts:read']),
    )

    expect(result).toBe('Tool execution failed. Please try again.')
    expect(sentryCaptureExceptionMock.mock.calls.some(([captured]) => captured === error)).toBe(
      true,
    )
    expect(
      await callStructuredMcpTool(caller, 'get_post_descendants', args, ['posts:read']),
    ).toMatchObject({
      success: true,
      descendants: [{ id: reply.id }],
      page_info: { has_next_page: false },
    })
  })
})
