/* oxlint-disable vitest/require-top-level-describe -- registered as a Vitest setupFile; the
   afterEach hook must wrap every route test in the project, so it cannot be inside a describe. */
import { afterAll, afterEach, vi } from 'vitest'
import { assertNoRequestQueryProfileViolations } from './api/request-query-profile-violations.mts'
import { withBatchRequestMarker, withToolCallProfile } from './api/mcp-tool-call-profile.mts'

// Each tool call of a multi-call MCP JSON-RPC request is profiled as its own unit; production
// handle-request.mts is untouched.
vi.mock(import('../services/mcp-tools/call-tool.mts'), async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    callMcpTool: withToolCallProfile(actual.callMcpTool as never) as typeof actual.callMcpTool,
  }
})
vi.mock(import('../services/mcp-tools/handle-request.mts'), async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    handleMcpHttpRequest: withBatchRequestMarker(
      actual.handleMcpHttpRequest as never,
    ) as typeof actual.handleMcpHttpRequest,
  }
})

// Fails the test whose request repeated a query annotation that is not in the committed baseline.
// A request made in a `beforeAll`, or finishing after its test, is reported by the next hook that
// drains the buffer, and the message still names the route and annotation.
afterEach(assertNoRequestQueryProfileViolations)
afterAll(assertNoRequestQueryProfileViolations)
