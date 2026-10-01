import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createTestStoryMembers } from '@voucha/test-helpers/entities/story-member-pages'
import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'

describe('get_story database failure', () => {
  it('reports a member lookup failure instead of an invalid cursor and returns the articles on retry', async () => {
    const caller = { ...(await createTestUser()), membership_plan: null }
    const { story, itemIds } = await createTestStoryMembers(1)
    const args = { story_id: story.id }

    const { result, error } = await withPostgresPoolQueryFailureForTest(
      '/* getStoryMemberPagesBatch */',
      () => callRejectedMcpTool(caller, 'get_story', args, ['posts:read']),
    )

    expect(result).toBe('Tool execution failed. Please try again.')
    expect(sentryCaptureExceptionMock.mock.calls.some(([captured]) => captured === error)).toBe(
      true,
    )
    expect(await callStructuredMcpTool(caller, 'get_story', args, ['posts:read'])).toMatchObject({
      success: true,
      story: { id: story.id },
      items: [{ id: itemIds[0] }],
      page_info: { has_next_page: false },
    })
  })
})
