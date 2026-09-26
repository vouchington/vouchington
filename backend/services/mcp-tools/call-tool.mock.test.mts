/* eslint-disable no-mistakes/vitest-mock-test-file-naming -- Routed to backend-mocks for the project-level @sentry/node mock (vitest.setup.sentry-mock.mts); asserts sentryCaptureExceptionMock. No in-file vi.mock, so the rule's unnecessaryMock branch fires; the .mock suffix is load-bearing for routing. */
import { createTestUser } from '@voucha/test-helpers'
import { ALL_TOOLS } from '@voucha/tools/registry/index'
import type { PrivateUser } from '@services/users/types'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import {
  callMcpTool,
  MAX_MCP_TOOL_RESULT_BYTES,
  MAX_MCP_TOOL_RESULT_VISITS,
  MCP_TOOL_RESULT_TOO_LARGE_TEXT,
} from './call-tool.mts'
import { USER_MCP_SERVER_CONFIG } from './config.mts'

const TOOL_NAME = 'get_trending_topics'

function stubToolFunction(run: () => Promise<unknown>) {
  const tool = ALL_TOOLS.find(candidate => candidate.schema.name === TOOL_NAME)
  if (!tool) throw new Error(`Expected ${TOOL_NAME} tool`)
  vi.spyOn(tool, 'function').mockReturnValue(run)
}

describe('callMcpTool result errors', () => {
  let user: PrivateUser & { membership_plan: null }

  beforeAll(async () => {
    user = { ...(await createTestUser()), membership_plan: null }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const call = () => callMcpTool(TOOL_NAME, {}, user, ['topics:read'], USER_MCP_SERVER_CONFIG)

  it.each([
    ['byte', () => ({ value: 'x'.repeat(MAX_MCP_TOOL_RESULT_BYTES + 1) })],
    [
      'traversal',
      () =>
        Object.fromEntries(
          Array.from({ length: MAX_MCP_TOOL_RESULT_VISITS }, (_, index) => [index, undefined]),
        ),
    ],
  ])('asks the caller to narrow a result over the %s limit', async (_limit, result) => {
    stubToolFunction(() => Promise.resolve(result()))

    await expect(call()).resolves.toEqual({
      isError: true,
      content: [{ type: 'text', text: MCP_TOOL_RESULT_TOO_LARGE_TEXT }],
    })
    expect(sentryCaptureExceptionMock).not.toHaveBeenCalled()
  })

  it('reports other tool failures with the generic message', async () => {
    const failure = new RangeError('limit must be between 1 and 100')
    stubToolFunction(() => Promise.reject(failure))

    await expect(call()).resolves.toEqual({
      isError: true,
      content: [{ type: 'text', text: 'Tool execution failed. Please try again.' }],
    })
    expect(sentryCaptureExceptionMock).toHaveBeenCalledOnce()
    expect(sentryCaptureExceptionMock.mock.calls[0]?.[0]).toBe(failure)
  })
})
