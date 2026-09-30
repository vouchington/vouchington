/* eslint-disable no-mistakes/vitest-mock-test-file-naming -- Routed to backend-mocks for the project-level @sentry/node mock (vitest.setup.sentry-mock.mts); asserts sentryCaptureExceptionMock. No in-file vi.mock, so the rule's unnecessaryMock branch fires; the .mock suffix is load-bearing for routing. */
import { createTestUser } from '@voucha/test-helpers'
import { ALL_TOOLS } from '@voucha/tools/registry/index'
import type { ToolInvocationContext } from '@voucha/tools/types'
import type { PrivateUser } from '@services/users/types'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { McpToolOutputMismatchError } from './build-tool-result.mts'
import {
  callMcpTool,
  MAX_MCP_TOOL_RESULT_BYTES,
  MAX_MCP_TOOL_RESULT_VISITS,
  MCP_TOOL_RESULT_TOO_LARGE_TEXT,
} from './call-tool.mts'
import { USER_MCP_SERVER_CONFIG } from './config.mts'

const TOOL_NAME = 'get_trending_topics'

function stubToolFunction(
  run: (args: unknown, context?: ToolInvocationContext) => Promise<unknown>,
  toolName = TOOL_NAME,
) {
  const tool = ALL_TOOLS.find(candidate => candidate.schema.name === toolName)
  if (!tool) throw new Error(`Expected ${toolName} tool`)
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

  it('passes only the verified MCP invocation context to the returned callable', async () => {
    const received: ToolInvocationContext[] = []
    stubToolFunction(async (_args, invocationContext) => {
      if (invocationContext) received.push(invocationContext)
      return {}
    })

    await callMcpTool(TOOL_NAME, {}, user, ['topics:read'], USER_MCP_SERVER_CONFIG)

    expect(received).toEqual([{ credentialOwnerId: user.id, grantedScopes: ['topics:read'] }])
  })
})

// get_my_cards declares an output schema; get_trending_topics does not.
describe('callMcpTool structured output', () => {
  const STRUCTURED_TOOL = 'get_my_cards'
  const GENERIC_FAILURE = 'Tool execution failed. Please try again.'
  let user: PrivateUser & { membership_plan: null }

  beforeAll(async () => {
    user = { ...(await createTestUser()), membership_plan: null }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const page = (pageInfo: Record<string, unknown> = {}) => ({
    success: true,
    result: {
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null, ...pageInfo },
    },
  })
  const callStructured = () =>
    callMcpTool(STRUCTURED_TOOL, {}, user, ['cards:read'], USER_MCP_SERVER_CONFIG)
  const callPlain = () => callMcpTool(TOOL_NAME, {}, user, ['topics:read'], USER_MCP_SERVER_CONFIG)

  it('returns structured content equal to the JSON in the text block', async () => {
    stubToolFunction(() => Promise.resolve(page({ end_cursor: 'abc' })), STRUCTURED_TOOL)

    const result = await callStructured()

    const [block] = result.content as [{ type: 'text'; text: string }]
    expect(result.isError).toBeUndefined()
    expect(result.structuredContent).toEqual(page({ end_cursor: 'abc' }))
    expect(result.structuredContent).toEqual(JSON.parse(block.text))
  })

  it('checks the JSON the client receives, not the in-memory value', async () => {
    // JSON drops an undefined property, so this passes additionalProperties: false on the wire.
    stubToolFunction(() => Promise.resolve(page({ dropped: undefined })), STRUCTURED_TOOL)

    const result = await callStructured()

    expect(result.isError).toBeUndefined()
    expect(result.structuredContent).toEqual(page())
  })

  it('reports a result that breaks its output schema and returns the generic failure', async () => {
    stubToolFunction(
      () => Promise.resolve(page({ has_next_page: 'secret-value-123' })),
      STRUCTURED_TOOL,
    )

    await expect(callStructured()).resolves.toEqual({
      isError: true,
      content: [{ type: 'text', text: GENERIC_FAILURE }],
    })
    expect(sentryCaptureExceptionMock).toHaveBeenCalledOnce()
    expect(sentryCaptureExceptionMock.mock.calls[0]?.[0]).toBeInstanceOf(McpToolOutputMismatchError)
  })

  it('never returns structured content for a result that is not an object', async () => {
    stubToolFunction(() => Promise.resolve('not an object'), STRUCTURED_TOOL)

    const result = await callStructured()

    expect(result).toEqual({ isError: true, content: [{ type: 'text', text: GENERIC_FAILURE }] })
    expect(sentryCaptureExceptionMock).toHaveBeenCalledOnce()
  })

  it('bounds the whole response, which carries the JSON twice', async () => {
    // Over half the bound, so the two copies cannot fit; a tool without a schema still can.
    const cursor = 'x'.repeat(MAX_MCP_TOOL_RESULT_BYTES * 0.6)
    stubToolFunction(() => Promise.resolve(page({ end_cursor: cursor })), STRUCTURED_TOOL)
    stubToolFunction(() => Promise.resolve(page({ end_cursor: cursor })))

    await expect(callStructured()).resolves.toEqual({
      isError: true,
      content: [{ type: 'text', text: MCP_TOOL_RESULT_TOO_LARGE_TEXT }],
    })
    const plain = await callPlain()
    expect(plain.isError).toBeUndefined()
    expect(plain.structuredContent).toBeUndefined()
    expect(sentryCaptureExceptionMock).not.toHaveBeenCalled()
  })

  it('counts the escaping of the text block toward the whole-response bound', async () => {
    // Each quote is 2 bytes in the JSON and 4 once that JSON sits inside the text block, so this
    // passes the half-bound check on the JSON alone and only the final response check rejects it.
    const cursor = '"'.repeat(MAX_MCP_TOOL_RESULT_BYTES * 0.2)
    stubToolFunction(() => Promise.resolve(page({ end_cursor: cursor })), STRUCTURED_TOOL)

    await expect(callStructured()).resolves.toEqual({
      isError: true,
      content: [{ type: 'text', text: MCP_TOOL_RESULT_TOO_LARGE_TEXT }],
    })
    expect(sentryCaptureExceptionMock).not.toHaveBeenCalled()
  })
})
