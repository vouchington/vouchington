import {
  optionArgs,
  callRejectedMcpTool,
  callStructuredMcpTool,
} from '@voucha/test-helpers/mcp-tool-contract'
import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestCommunity } from '@voucha/test-helpers'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'

describe('MCP public community database failure', () => {
  it('reports a database failure instead of hiding the community and returns it on retry', async () => {
    const caller = { ...(await createTestUser()), membership_plan: null }
    const community = await insertTestCommunity({ createdById: caller.id, visibility: 'public' })
    const args = { community_id: community.id }

    const { result, error } = await withPostgresPoolQueryFailureForTest(
      '/* getCommunityWithViewerById */',
      () =>
        callRejectedMcpTool(caller, 'read_community', optionArgs('details', args), [
          'communities:read',
        ]),
    )

    expect(result).toBe('Tool execution failed. Please try again.')
    expect(sentryCaptureExceptionMock.mock.calls.some(([captured]) => captured === error)).toBe(
      true,
    )
    expect(
      await callStructuredMcpTool(caller, 'read_community', optionArgs('details', args), [
        'communities:read',
      ]),
    ).toMatchObject({ success: true, community: { id: community.id } })
  })
})
